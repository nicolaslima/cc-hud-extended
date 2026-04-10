/**
 * Stdin reader for the statusline payload.
 * Includes a timeout guard to prevent hanging.
 */

const STDIN_TIMEOUT_MS = 3000;

/** Read raw JSON from stdin with timeout */
export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";

  return new Promise<string>((resolve) => {
    let input = "";
    const timeout = setTimeout(() => {
      resolve(input);
    }, STDIN_TIMEOUT_MS);

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      input += chunk;
    });
    process.stdin.on("end", () => {
      clearTimeout(timeout);
      resolve(input);
    });
    process.stdin.on("error", () => {
      clearTimeout(timeout);
      resolve(input);
    });
  });
}