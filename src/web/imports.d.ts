declare module "*.css" {
  const content: string;
  export default content;
}

declare module "*.js" {
  const content: string;
  export default content;
}

declare module "zone-files" {
  const files: Record<string, string>;
  export default files;
}
