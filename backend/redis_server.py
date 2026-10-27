"""
Lightweight Redis-compatible RESP2 TCP server on 127.0.0.1:6379.
Allows backend/app/main.py and scraper_worker.py to connect via
standard redis.asyncio ("redis://localhost:6379") even when Docker Desktop is not running.
"""
import asyncio
from collections import defaultdict

sets_store: dict[str, set[str]] = defaultdict(set)
hashes_store: dict[str, dict[str, str]] = defaultdict(dict)
lists_store: dict[str, list[str]] = defaultdict(list)
kv_store: dict[str, str] = {}
subscribers: dict[str, set[asyncio.StreamWriter]] = defaultdict(set)


def encode_simple(msg: str) -> bytes:
    return f"+{msg}\r\n".encode("utf-8")


def encode_error(msg: str) -> bytes:
    return f"-ERR {msg}\r\n".encode("utf-8")


def encode_int(val: int) -> bytes:
    return f":{val}\r\n".encode("utf-8")


def encode_bulk(val: str | None) -> bytes:
    if val is None:
        return b"$-1\r\n"
    data = val.encode("utf-8")
    return f"${len(data)}\r\n".encode("utf-8") + data + b"\r\n"


def encode_array(items: list[bytes]) -> bytes:
    out = [f"*{len(items)}\r\n".encode("utf-8")]
    out.extend(items)
    return b"".join(out)


async def read_resp(reader: asyncio.StreamReader) -> list[str] | None:
    line = await reader.readline()
    if not line:
        return None
    line_str = line.decode("utf-8", errors="replace").strip()
    if not line_str:
        return []
    if line_str.startswith("*"):
        count = int(line_str[1:])
        args: list[str] = []
        for _ in range(count):
            header = await reader.readline()
            if not header:
                return None
            length = int(header.decode("utf-8").strip()[1:])
            if length == -1:
                args.append("")
            else:
                data = await reader.readexactly(length + 2)
                args.append(data[:-2].decode("utf-8", errors="replace"))
        return args
    return line_str.split()


async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    subscribed_channels: set[str] = set()
    try:
        while True:
            cmd_args = await read_resp(reader)
            if cmd_args is None:
                break
            if not cmd_args:
                continue

            cmd = cmd_args[0].upper()

            if cmd == "PING":
                msg = cmd_args[1] if len(cmd_args) > 1 else "PONG"
                if subscribed_channels:
                    writer.write(encode_array([encode_bulk("pong"), encode_bulk("")]))
                else:
                    writer.write(encode_simple(msg))
            elif cmd == "HELLO":
                # Force client to fall back to RESP2 gracefully
                writer.write(encode_error("NOPROTO sorry, this protocol version is not supported"))
            elif cmd in ("CLIENT", "SELECT", "QUIT"):
                writer.write(encode_simple("OK"))
            elif cmd == "INFO":
                writer.write(encode_bulk("redis_version:7.2.0\r\n"))
            elif cmd == "SADD":
                key = cmd_args[1]
                added = 0
                for member in cmd_args[2:]:
                    if member not in sets_store[key]:
                        sets_store[key].add(member)
                        added += 1
                writer.write(encode_int(added))
            elif cmd == "EXISTS":
                count = 0
                for key in cmd_args[1:]:
                    if (
                        key in sets_store
                        or key in hashes_store
                        or key in lists_store
                        or key in kv_store
                    ):
                        count += 1
                writer.write(encode_int(count))
            elif cmd == "HSET":
                key = cmd_args[1]
                added = 0
                pairs = cmd_args[2:]
                for i in range(0, len(pairs) - 1, 2):
                    field, val = pairs[i], pairs[i + 1]
                    if field not in hashes_store[key]:
                        added += 1
                    hashes_store[key][field] = val
                writer.write(encode_int(added))
            elif cmd == "EXPIRE":
                writer.write(encode_int(1))
            elif cmd == "LPUSH":
                key = cmd_args[1]
                for val in cmd_args[2:]:
                    lists_store[key].insert(0, val)
                writer.write(encode_int(len(lists_store[key])))
            elif cmd == "LTRIM":
                key = cmd_args[1]
                start, stop = int(cmd_args[2]), int(cmd_args[3])
                lst = lists_store.get(key, [])
                if stop == -1:
                    lists_store[key] = lst[start:]
                else:
                    lists_store[key] = lst[start : stop + 1]
                writer.write(encode_simple("OK"))
            elif cmd == "LRANGE":
                key = cmd_args[1]
                start, stop = int(cmd_args[2]), int(cmd_args[3])
                lst = lists_store.get(key, [])
                if stop == -1:
                    sliced = lst[start:]
                else:
                    sliced = lst[start : stop + 1]
                writer.write(encode_array([encode_bulk(item) for item in sliced]))
            elif cmd == "SUBSCRIBE":
                for channel in cmd_args[1:]:
                    subscribers[channel].add(writer)
                    subscribed_channels.add(channel)
                    msg = encode_array([
                        encode_bulk("subscribe"),
                        encode_bulk(channel),
                        encode_int(len(subscribed_channels)),
                    ])
                    writer.write(msg)
            elif cmd == "UNSUBSCRIBE":
                channels = cmd_args[1:] or list(subscribed_channels)
                for channel in channels:
                    subscribers[channel].discard(writer)
                    subscribed_channels.discard(channel)
                    msg = encode_array([
                        encode_bulk("unsubscribe"),
                        encode_bulk(channel),
                        encode_int(len(subscribed_channels)),
                    ])
                    writer.write(msg)
            elif cmd == "PUBLISH":
                channel = cmd_args[1]
                payload = cmd_args[2]
                subs = list(subscribers.get(channel, set()))
                delivered = 0
                pub_frame = encode_array([
                    encode_bulk("message"),
                    encode_bulk(channel),
                    encode_bulk(payload),
                ])
                for sub_writer in subs:
                    try:
                        sub_writer.write(pub_frame)
                        await sub_writer.drain()
                        delivered += 1
                    except Exception:
                        subscribers[channel].discard(sub_writer)
                writer.write(encode_int(delivered))
            else:
                writer.write(encode_simple("OK"))

            await writer.drain()
    except ( asyncio.IncompleteReadError, ConnectionResetError, BrokenPipeError ):
        pass
    finally:
        for ch in subscribed_channels:
            subscribers[ch].discard(writer)
        try:
            writer.close()
        except Exception:
            pass


async def main():
    server = await asyncio.start_server(handle_client, "127.0.0.1", 6379)
    print("Redis-compatible server listening on 127.0.0.1:6379")
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
