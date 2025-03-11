import { GameAnalyticsPipelineConfig } from "./config-types";
import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";

// Loads environment configuration from config.yaml
export function getConfig(): GameAnalyticsPipelineConfig {
    let unparsedConfig: GameAnalyticsPipelineConfig = yaml.load(
        fs.readFileSync(path.resolve("./config.yaml"), "utf8")
    ) as GameAnalyticsPipelineConfig;
    console.log(unparsedConfig);
    return unparsedConfig;
}
