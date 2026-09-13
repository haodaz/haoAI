async function run() {
  const mod = await import('word-extractor');
  console.log(Object.keys(mod));
  console.log(typeof mod.default);
}
run();
