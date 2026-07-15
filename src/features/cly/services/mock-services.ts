/**
 * Demo/test compatibility adapter.
 *
 * Production renderer modules must import `projectServices` directly. This
 * alias remains only for deterministic tests and explicit demo mode while the
 * remaining preview-only services are retired.
 */
export { projectServices as mockServices } from "./project-services";
