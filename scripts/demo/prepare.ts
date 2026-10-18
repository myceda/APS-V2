import { configureDemo, cliOptions } from "./runtime";
const options=cliOptions(process.argv.slice(2));
configureDemo();
const {prepareDemo}=await import("./store");
const {getDatabase}=await import("../../src/server/database");
try {
  const result=await prepareDemo(options.run);
  console.log(JSON.stringify({run:options.run,alreadyPrepared:result.alreadyPrepared,accounts:result.manifest.accounts.length,manifest:`storage/demo/${options.run}/manifest.json`,notice:result.manifest.note}));
} catch(error) { console.error(error instanceof Error?error.message:"เตรียมชุดสาธิตไม่สำเร็จ"); process.exitCode=1; }
finally { await getDatabase().$disconnect(); }
