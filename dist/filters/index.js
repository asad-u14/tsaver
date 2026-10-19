import { GenericFilter } from "./generic.js";
import { PytestFilter } from "./pytest.js";
import { NpmFilter } from "./npm.js";
import { CustomFilter } from "./custom.js";
import { loadCustomFilterConfigs } from "./loadCustom.js";
const BUILTIN_PROFILES = {
    pytest: () => new PytestFilter(),
    "py.test": () => new PytestFilter(),
    npm: () => new NpmFilter(),
};
export function selectFilter(command) {
    const base = command.split("/").pop() ?? command;
    const customConfigs = loadCustomFilterConfigs();
    const customConfig = customConfigs.get(base);
    if (customConfig) {
        return { filter: new CustomFilter(customConfig), name: `custom:${base}` };
    }
    const builtin = BUILTIN_PROFILES[base];
    if (builtin) {
        return { filter: builtin(), name: base };
    }
    return { filter: new GenericFilter(), name: "generic" };
}
