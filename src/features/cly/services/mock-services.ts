/**
 * Demo/test compatibility adapter.
 *
 * Production renderer modules import `projectServices` directly. This alias
 * remains for deterministic tests and explicit demo mode.
 */
export { projectServices as mockServices } from "./project-services";
