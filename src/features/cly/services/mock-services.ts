/**
 * Automated-test compatibility adapter.
 *
 * Production renderer modules import `projectServices` directly. This alias
 * remains only for deterministic automated tests.
 */
export { projectServices as mockServices } from "./project-services";
