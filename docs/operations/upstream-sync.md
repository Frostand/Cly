# Legacy code assessment

The current embedded code-workspace components are transitional assets, not an upstream dependency. Before retaining, adapting, or replacing a legacy component, record:

1. the research workflow it enables;
2. the stable Cly core interface it consumes;
3. whether an external IDE, notebook, CLI, or browser client could provide the same capability; and
4. migration and security risks.

Do not merge code from former upstream projects into Cly as routine maintenance. Preserve third-party notices and selectively port only independently justified capabilities.
