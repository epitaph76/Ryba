# S8A Explicit Cross-Subspace References

## Scope

Stage `S-8A` adds explicit document-link references between the space root and group subspaces, and between groups inside the same space. The local mental model remains unchanged:

- bare `link_name` stays local to the current subspace;
- explicit `root.link_name` targets the root subspace of the current space;
- explicit `group-slug.link_name` targets a specific group inside the current space.

This stage does not introduce a global namespace, implicit scope guessing, or nested path syntax.

## Implemented Behavior

### Link grammar and resolution

- document-link tokens now parse an optional qualifier before the definition key;
- stored references keep both `linkKey` and canonical `definitionKey`;
- the resolver builds a scope-aware definition map for the current space:
  - current subspace definitions are available as bare keys and as explicit qualified keys;
  - other subspaces are available only via explicit qualified keys.

### Validation

- qualified links must resolve to an existing definition in the addressed subspace;
- unresolved qualified references fail validation with `VALIDATION_ERROR` and include:
  - `blockId`
  - `linkKey`
  - `scope`
- explicit references do not bypass workspace permission checks; resolution still happens only inside the current readable space.

### Sync and backlinks

- sync links use `definitionKey` plus the source document identity so collisions like local `shared_live` and `root.shared_live` update the correct source;
- backlinks and mentioned entity previews now include source subspace metadata:
  - `groupId`
  - `groupSlug`
  - `sourceGroupId`
  - `sourceGroupSlug`

## UX Notes

- the document dialog explains the explicit syntax: `root.link_name` and `group-slug.link_name`;
- linked entities and backlinks show whether the source lives in `root` or in a named group;
- opening a linked entity or backlink can switch the active subspace before loading the target document.

## Stage Boundaries Preserved

- no implicit fallback from `group-slug.link_name` to any other scope;
- no promotion of bare keys to a space-wide namespace;
- no cross-space references;
- no broader redesign of canvas permissions or graph semantics beyond qualified document-link resolution.
