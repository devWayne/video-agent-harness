# Approved Profile contract

Every production H3 Profile must declare:

- stable ID, semantic version, Workflow hash, compatible ComfyUI build, custom-node versions, and required model files;
- purpose, supported reference roles, aspect ratios, frame/duration limits, expected output role, and local VRAM class;
- exposed input slots and their JSON types, ranges, enums, units, defaults, and whether the Agent may modify them;
- immutable nodes and forbidden operations such as model downloads, paid Partner nodes, arbitrary file access, or server restart;
- estimated runtime, memory, storage, and validation checks;
- known failure signatures and safe retry patch ranges.

An Agent may select a Profile and patch declared slots. It may not mutate graph topology in production. Experimental graphs must be discovered and tested in a separate development session, then reviewed and registered before use.
