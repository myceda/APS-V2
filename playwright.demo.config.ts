import { defineConfig, devices } from "@playwright/test";
import { configureDemo } from "./scripts/demo/runtime";
configureDemo();
process.env.APS_DEMO_RUN ||= `browser-${Date.now().toString(36)}`;
export default defineConfig({
  testDir:"./tests/e2e/demo",fullyParallel:false,workers:1,retries:0,forbidOnly:Boolean(process.env.CI),
  globalSetup:"./tests/e2e/demo/setup.ts",globalTeardown:"./tests/e2e/demo/teardown.ts",
  reporter:[["list"],["json",{outputFile:"storage/test-reports/demo.json"}]],outputDir:"storage/demo-browser-results",
  use:{baseURL:"http://localhost:3102",trace:"retain-on-failure",screenshot:"only-on-failure"},
  projects:[{name:"desktop",use:{...devices["Desktop Chrome"],viewport:{width:1440,height:1000}}},{name:"mobile",use:{...devices["Pixel 7"]}}],
  webServer:{command:"npm run start -- --port 3102",url:"http://localhost:3102",reuseExistingServer:false,timeout:60_000,env:{DATABASE_URL:process.env.TEST_DATABASE_URL!,BETTER_AUTH_SECRET:process.env.TEST_AUTH_SECRET!,BETTER_AUTH_URL:"http://localhost:3102",APS_DEMO_MODE:"1",GOOGLE_CLIENT_ID:"",GOOGLE_CLIENT_SECRET:"",NEXT_TELEMETRY_DISABLED:"1"}},
});
