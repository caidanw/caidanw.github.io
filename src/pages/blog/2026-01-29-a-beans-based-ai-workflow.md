---
layout: src/layouts/BlogPost.astro
title: 'A Beans Based AI Workflow'
date: '2026-01-29T17:03:00-08:00'
description: Experimenting on the frontier of AI using beans
draft: false
---

> Since the title is a bit of click-bait, I should probably specify what I mean by **bean based**.
> I found a lovely tool for creating [_beans_](https://github.com/hmans/beans) that are essentially just markdown files with some front matter for task tracking.
> Now back to the article!

I feel like a mad scientist.
I spent the last week analyzing agentic coding tools, ideating on what I like and dislike about them, and then deciding to build my own.

During my analysis, the main issue I found with most agentic coding tools right now is that they all focus on one thing: running as many agents in parallel as possible. But why? Why run 10, 100, or even 1000 agents when you are unable to write enough tickets for them to consume?

Maybe I'm wrong. Maybe I should be running hundreds of agents in parallel, but I can't honestly say I've ever run more than 2 at a time. Both working on separate tasks, and I spent most of my time not in setting up and running agents, but in defining the work that needs to be done. Also, the context switching from managing two agents was exhausting.

I want to take this in a new direction. Let's flip the entire script on its head and think about this pragmatically. I don't think the bottleneck here is a lack of enough agents. The bottleneck is not having clear enough tasks for these agents to work on. I can not write instructions fast enough to outpace the work of a single agent. I doubt you can either. Prove me wrong. I have yet to see anyone actually write and think fast enough to keep up with the pace of a single agent writing the code. Most of my time working with an agent is spent answering questions, rethinking approaches, and dealing with unforeseen bugs. It requires a ton of my attention and focus to handhold these agents.

What if we took a different approach? What if we looked at some examples of how software engineering has been traditionally managed? In come PRDs (Product Requirement Documents), made with the explicit intent to get one person's thoughts into another person's actions. Isn't that all we are doing with agents now, defining a document for an agent to follow instructions to implement?

I'm building Daedalus, a from-scratch custom planning agent. Yes, I'm building an agent from scratch. Yes, I don't really know how this will go. I believe we live in an exciting wild time with an entire new frontier, waiting to be explored. I'm putting in the time and effort to try an experiment for myself. I am willing to accept failure. I am willing to be wrong. I hope that this works.

> Daedalus was the greatest mortal craftsman and inventor in Greek mythology—an Athenian architect, engineer, and artist whose name literally means "skillfully wrought" or "cunning worker."  
> He's essentially the mythological archetype of the brilliant but flawed engineer—someone whose genius creates both wonders and disasters, who solves problems with ingenuity but can't escape the human consequences of his choices.  
> -- Claude

I chose the name Daedalus because I feel that it embodies the soul of an engineer: planning, thinking, criticizing, researching, and questioning. Yet, there is hubris manifest in his work, which parallels how I feel about AI coding agents. Daedalus doesn't write code--that's not the point. Though, he has access to a breadth of expert sub-agents: critics, skeptics, pragmatists, architects, simplifiers, UX researchers, code explorers, and more. The goal for Daedalus is to outpace the coding agent, which I've aptly named Talos, the bronze automaton that protected the island of Crete. You don't talk to Talos, nor do you need to. He finds the next task and starts working. Do note that I've tailored Talos to approach coding using TDD (test driven development), which I've found yields a slightly better success rate for autonomous implementation. I borrowed the idea and a few other skills from the [superpowers](https://github.com/obra/superpowers) repo.

However, that's not to say what I've built is prescriptive. You can do it at home, without any of my specialized tools. You need two agent instances, OpenCode, Claude Code, Codex, it doesn't matter. One is your coding agent, always in "build" mode. It's confined to a [ralph loop](https://www.humanlayer.dev/blog/brief-history-of-ralph), always picking up the next available task. The other, a planning agent, whose only responsibility is to create tickets and critique what already exists. No specialized tools. This is a workflow, a process. Not something to be sold to you.

A bit more about [_beans_](https://github.com/hmans/beans). It describes itself as, "A CLI-based, flat-file issue tracker for humans and robots." However, the power in this approach over other longer term memory tools for agents, like [beads](https://github.com/steveyegge/beads), is that it's plain text. The tool parses the front matter of the beans on startup and then works on that in-memory data structure. The beauty is that I can easily read and modify this myself, and I can check it into git. Additionally, beans has a built-in GraphQL API, which is quite handy for the agents to be able to get relational data about these flat files. Each bean has a `title`, `status`, `type`, `priority`, and optional `blockedBy` fields. I'm using this to handle complicated, long running, and autonomous PRD implementation. My ralph loop starts by querying for beans that are `in-progress` or `todo` then creates the dependency graph using the `blockedBy` field. This allows me to find which bean we need to work on first, pass that bean to the coding agent and let it run.

Beans are the lifeblood of this workflow. Whether or not you use beans or another tool, it doesn't really matter. The only thing you need to make it work is a structured way to define tasks with enough context that an agent can work on it without human intervention. And ideally in that structure you have some way to organize which tasks are dependent on the work of other tasks.

Your role in this system is to guide. It's to sit with the planning agent, and only the planning agent. To scope out features, bugs, epics, and milestones. Talk with the planning agent and create a bean, iterate on it, question its design, scope, and purpose. Once you feel like it's done, move on. Let the planning agent write the outline and implementation details in the bean. Then pass it to the coding agent and take a walk.

Now the real power comes from not just creating these beans and passing them to a coding agent. It's in the dependency graph. Beyond just the `blockedBy`, it's the parent/child relationships between milestones, epics, features, tasks, and bugs. And taking advantage of that structure in a ralph loop. As I've been experimenting, I've noticed additional ways I can modify my loop and make it better. The original ralph loop uses a `<promise>DONE</promise>` signal to track when the agent says it's done. I rely on the bean being moved to the `completed` status.

Here's the flow for my ralph loop (or you can view the [source code](https://github.com/internet-development/daedalus/blob/3aef48bf8c8b9aac1e884e76f004c7da7f6a57ce/scripts/ralph-loop.sh)):

1. **Pick a bean** — Query for todo/in-progress beans, filter out blocked ones, sort by in-progress first then priority (critical → deferred), take the top one
2. **Mark it in-progress** via beans update
3. **Generate a prompt** — Implementation prompt for tasks/bugs, review prompt for epics/milestones
4. **Run the AI agent** (opencode/claude/codex)
5. **If agent failed** — increment consecutive failure counter, sleep 2s, retry. After 3 consecutive failures, abandon this bean and move to next
6. **If agent succeeded** — reset failure counter, WIP commit any uncommitted changes, then check bean status:
   - completed → notify, move on
   - stuck (blocked/failed tag) → notify, move on
   - other → ring terminal bell, loop back to step 3 (re-fetch fresh data each time)
7. **If max iterations hit** — log warning, move on
8. **Pick next bean** — unless `--once` or a specific bean was given, in which case exit
9. **No beans left** → exit

That's it, it's basically a while loop that feeds beans to an AI agent until they're done.

So where is Daedalus now? Well it's still a WIP. You can use the philosophy and workflow now but I am working on a tool to make this significantly easier. You can check out the repo [here](https://github.com/internet-development/daedalus) and use the agents and skills in your OpenCode or Claude Code.

I'd love to hear some feedback on what you think about this experiment.
