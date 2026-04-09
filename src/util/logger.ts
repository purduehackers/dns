const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const GRAY = "\x1b[90m";
const BOLD_CODE = "\x1b[1m";

export function info(msg: string) {
  console.log(`${BLUE}ℹ${RESET} ${msg}`);
}

export function success(msg: string) {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

export function warn(msg: string) {
  console.log(`${YELLOW}⚠${RESET} ${msg}`);
}

export function error(msg: string) {
  console.error(`${RED}✗${RESET} ${msg}`);
}

export function dim(msg: string) {
  console.log(`${GRAY}${msg}${RESET}`);
}

export function bold(msg: string) {
  console.log(`${BOLD_CODE}${msg}${RESET}`);
}

export function create(msg: string) {
  console.log(`  ${GREEN}+ ${msg}${RESET}`);
}

export function update(msg: string) {
  console.log(`  ${YELLOW}~ ${msg}${RESET}`);
}

export function del(msg: string) {
  console.log(`  ${RED}- ${msg}${RESET}`);
}

export function noop(msg: string) {
  console.log(`  ${GRAY}  ${msg}${RESET}`);
}
