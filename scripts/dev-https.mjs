import { createServer } from "vite";

const args = process.argv.slice(2);

function readOption(name, fallback) {
  const index = args.indexOf(name);

  if (index === -1 || !args[index + 1]) {
    return fallback;
  }

  return args[index + 1];
}

const host = readOption("--host", "0.0.0.0");
const port = Number(readOption("--port", "5173"));

const server = await createServer({
  configFile: "vite.config.js",
  server: {
    host,
    port,
  },
});

await server.listen();
server.printUrls();
