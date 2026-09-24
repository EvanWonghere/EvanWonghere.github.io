# CLAUDE.md

@AGENTS.md

## Claude-specific notes

### Artifacts

Publish these as private Artifacts instead of leaving them only in the terminal:

- Task and acceptance reports, including which tests, builds and browser checks ran, which were skipped and why.
- Design proposals and implementation plans the owner needs to approve, such as new study tools, games or the music AI integration.
- Review summaries that the owner needs to decide on.

The repository stays the durable record: update `static/music/README.md` and other in-repo docs when behaviour changes. An Artifact summarizes them for reading; it does not replace those updates. Never put secrets, Supabase keys or project refs, or anyone's exported learning progress into an Artifact.
