import { defineConfig, devices } from "@playwright/test";
if(!process.env.APS_PDF_RUN_DIR) throw new Error("Use npm.cmd run test:e2e:pdf; do not run this config against another server");
export default defineConfig({
  testDir:"./tests/e2e/pdf",workers:1,fullyParallel:false,retries:0,timeout:60_000,
  reporter:[["list"],["json",{outputFile:`${process.env.APS_PDF_RUN_DIR}/browser-results.json`}]],
  outputDir:`${process.env.APS_PDF_RUN_DIR}/test-results`,
  use:{baseURL:"http://localhost:3103",trace:"off",video:"off",screenshot:"off"},
  projects:[
    {name:"desktop",use:{...devices["Desktop Chrome"],viewport:{width:1440,height:1000},headless:false}},
    {name:"mobile",grep:/@mobile/,use:{...devices["Pixel 7"]}},
  ],
});
