import { GenericFilter } from "./generic.js";
import { PytestFilter } from "./pytest.js";
import { NpmFilter } from "./npm.js";
import { CargoFilter } from "./cargo.js";
import { GoTestFilter } from "./goTest.js";
import { GitFilter } from "./git.js";
import { CustomFilter } from "./custom.js";
import { PassthroughFilter } from "./passthrough.js";
import { loadCustomFilterConfigs } from "./loadCustom.js";
import { isFilterDisabled } from "../retrievalTracking.js";
const BUILTIN_PROFILES = {
    pytest: () => new PytestFilter(),
    "py.test": () => new PytestFilter(),
    npm: () => new NpmFilter(),
    cargo: () => new CargoFilter(),
    go: () => new GoTestFilter(),
    git: () => new GitFilter(),
};
// The generic fallback is intentionally excluded from adaptive disabling: it
// isn't tied to one tool, so disabling it would silently stop filtering
// every unmatched command rather than just the one actually being retrieved
// repeatedly.
export function selectFilter(command) {
    const base = command.split("/").pop() ?? command;
    const customConfigs = loadCustomFilterConfigs();
    const customConfig = customConfigs.get(base);
    if (customConfig) {
        const name = `custom:${base}`;
        if (isFilterDisabled(name))
            return { filter: new PassthroughFilter(), name: `${name} (disabled)` };
        return { filter: new CustomFilter(customConfig), name };
    }
    const builtin = BUILTIN_PROFILES[base];
    if (builtin) {
        if (isFilterDisabled(base))
            return { filter: new PassthroughFilter(), name: `${base} (disabled)` };
        return { filter: builtin(), name: base };
    }
    return { filter: new GenericFilter(), name: "generic" };
}
