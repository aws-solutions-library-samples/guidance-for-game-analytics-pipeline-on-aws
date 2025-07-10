import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import assert from "assert";

// used to validate glue names
const glue_re = new RegExp("^[a-zA-Z0-9][a-zA-Z0-9_]{0,254}$")

// Loads environment configuration from config.yaml
function getConfig() {
    let unparsedConfig = yaml.load(
        fs.readFileSync(path.resolve("./infrastructure/config.yaml"), "utf8")
    );
    return unparsedConfig;
}

let config = getConfig()

console.log(getConfig())

assert(config.INGEST_MODE == "KINESIS_DATA_STREAMS" || config.INGEST_MODE == "DIRECT_BATCH", "INGEST_MODE needs to be set to KINESIS_DATA_STREAMS or DIRECT_BATCH")
// ingest mode needs to be set to kinesis data streams for real time analytics to work
assert(!config.REAL_TIME_ANALYTICS || (config.INGEST_MODE == "KINESIS_DATA_STREAMS" && config.REAL_TIME_ANALYTICS), "REAL_TIME_ANALYTICS can only be enabled if INGEST_MODE is set to KINESIS_DATA_STREAMS")
// kinesis needs to be enabled for redshift to work
assert(config.DATA_PLATFORM_MODE == "DATA_LAKE" || config.DATA_PLATFORM_MODE == "REDSHIFT", "DATA_PLATFORM_MODE can only be set to REDSHIFT or DATA_LAKE")
assert(config.DATA_PLATFORM_MODE == "DATA_LAKE" || (config.INGEST_MODE == "KINESIS_DATA_STREAMS" && config.DATA_PLATFORM_MODE == "REDSHIFT"), "DATA_PLATFORM_MODE can only be set to REDSHIFT if INGEST_MODE is set to KINESIS_DATA_STREAMS")
// iceberg will only be enabled if data lake is enabled
assert(!config.ENABLE_APACHE_ICEBERG_SUPPORT || (config.ENABLE_APACHE_ICEBERG_SUPPORT && config.DATA_PLATFORM_MODE == "DATA_LAKE"), "ENABLE_APACHE_ICEBERG_SUPPORT cannot be enabled if the DATA_PLATFORM_MODE is set to REDSHIFT")
assert(glue_re.test(config.EVENTS_DATABASE), `EVENTS_DATABASE should only include upper and lowercase letters, numbers, and underscores. current value is "${config.EVENTS_DATABASE}"`)
assert(glue_re.test(config.RAW_EVENTS_TABLE), `RAW_EVENTS_TABLE should only include upper and lowercase letters, numbers, and underscores. current value is "${config.RAW_EVENTS_TABLE}"`)

console.log("The configuration is valid!")