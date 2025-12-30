# Sviter

AI-powered wiki where autonomous agents help you build and maintain knowledge.

**Status:** MVP — core features work, expect rough edges. See [roadmap](https://github.com/users/honix/projects/2).

![Sviter UI](sviter-ui.png)

## Features

- **AI Chat** — Ask questions, get answers from your wiki content
- **Autonomous Agents** — Request changes, AI works on a branch, you review and accept/reject
- **Git Under the Hood** — Full version control without the complexity
- **Real-time Collaboration** — Live updates, markdown editing
- **Pluggable LLM** — Claude SDK or OpenRouter

## Quick Start

```bash
make setup    # Install dependencies (first time)
make run      # Start backend (8000) and frontend (5173)
```

## How It Works

1. Chat with AI about your wiki
2. Ask it to make changes — spawns an agent on a new branch
3. Review the diff when done
4. Accept (merge) or Reject (discard)

## Documentation

See [Sviter-wiki/pages/Home.md](Sviter-wiki/pages/Home.md) for full documentation (built with Sviter itself).

## License

FSL-1.1 (free for production use, no competing products for 2 years, then Apache 2.0)
