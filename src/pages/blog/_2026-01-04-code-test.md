---
layout: src/layouts/BlogPost.astro
title: Code Syntax Highlighting Test
date: '2026-01-04T12:00:00-08:00'
description: A comprehensive test file for previewing code syntax highlighting across languages
draft: true
---

A comprehensive test of syntax highlighting across various languages and frameworks.

### JavaScript

```javascript
// Async function with destructuring and arrow functions
const fetchUserData = async ({ userId, includeProfile = true }) => {
  const baseUrl = 'https://api.example.com'
  const endpoint = `${baseUrl}/users/${userId}`

  try {
    const response = await fetch(endpoint)
    const { name, email, ...rest } = await response.json()
    const roles = ['admin', 'user', 'guest'].filter((r) => r !== 'guest')

    console.log(`Fetched user: ${name}`)
    return includeProfile ? { name, email, ...rest } : { name, email }
  } catch (error) {
    throw new Error(`Failed to fetch user ${userId}: ${error.message}`)
  }
}
```

### TypeScript

```typescript
interface User<T extends Record<string, unknown>> {
  id: number
  name: string
  email: string
  metadata: T
  createdAt: Date
}

type UserRole = 'admin' | 'editor' | 'viewer'

async function createUser<T extends Record<string, unknown>>(userData: Omit<User<T>, 'id' | 'createdAt'>, role: UserRole = 'viewer'): Promise<User<T>> {
  const id = Math.floor(Math.random() * 10000)
  const createdAt = new Date()

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(userData.email)) {
    throw new Error('Invalid email format')
  }

  return { id, createdAt, ...userData }
}
```

### React/JSX

```jsx
import { useState, useEffect, useCallback } from 'react'

function UserProfile({ userId, onError }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch(`/api/users/${userId}`)
      const data = await res.json()
      setUser(data)
    } catch (err) {
      onError?.(err.message)
    } finally {
      setLoading(false)
    }
  }, [userId, onError])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  if (loading) return <div className="spinner">Loading...</div>

  return (
    <article className="user-profile">
      <h2>{user?.name ?? 'Unknown User'}</h2>
      <p>{user?.email}</p>
      <button onClick={() => fetchUser()}>Refresh</button>
    </article>
  )
}
```

### Python

```python
from dataclasses import dataclass
from typing import Optional
from functools import lru_cache
import asyncio

@dataclass
class User:
    id: int
    name: str
    email: str
    active: bool = True

class UserService:
    def __init__(self, db_connection):
        self._db = db_connection
        self._cache = {}

    @lru_cache(maxsize=128)
    def get_user(self, user_id: int) -> Optional[User]:
        """Fetch a user by ID with caching."""
        return self._db.query(User).filter_by(id=user_id).first()

    async def get_active_users(self) -> list[User]:
        users = await self._db.fetch_all("SELECT * FROM users")
        return [User(**u) for u in users if u["active"]]

    def format_users(self, users: list[User]) -> str:
        return "\n".join(f"{u.name} <{u.email}>" for u in users)
```

### Rust

```rust
use std::collections::HashMap;
use std::error::Error;

#[derive(Debug, Clone)]
struct User {
    id: u64,
    name: String,
    email: String,
}

impl User {
    fn new(id: u64, name: &str, email: &str) -> Self {
        Self {
            id,
            name: name.to_string(),
            email: email.to_string(),
        }
    }

    fn validate(&self) -> Result<(), Box<dyn Error>> {
        match self.email.contains('@') {
            true => Ok(()),
            false => Err("Invalid email format".into()),
        }
    }
}

fn find_user(users: &HashMap<u64, User>, id: u64) -> Option<&User> {
    users.get(&id).filter(|u| !u.name.is_empty())
}
```

### Go

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
)

type User struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type UserService interface {
	GetUser(ctx context.Context, id int64) (*User, error)
}

func fetchUsers(ctx context.Context, ids []int64) ([]*User, error) {
	var wg sync.WaitGroup
	users := make([]*User, len(ids))
	errChan := make(chan error, len(ids))

	for i, id := range ids {
		wg.Add(1)
		go func(idx int, userID int64) {
			defer wg.Done()
			user, err := fetchUser(ctx, userID)
			if err != nil {
				errChan <- fmt.Errorf("failed to fetch user %d: %w", userID, err)
				return
			}
			users[idx] = user
		}(i, id)
	}

	wg.Wait()
	close(errChan)

	if err := <-errChan; err != nil {
		return nil, err
	}
	return users, nil
}
```

### HTML

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="A sample page for testing" />
    <title>Sample Page</title>
    <link rel="stylesheet" href="/styles/main.css" />
  </head>
  <body>
    <header class="site-header" role="banner">
      <nav aria-label="Main navigation">
        <a href="/" class="logo">Home</a>
        <ul class="nav-links">
          <li><a href="/about">About</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
      </nav>
    </header>
    <main id="content">
      <article data-id="123" data-category="tech">
        <h1>Welcome</h1>
        <p>This is a <strong>sample</strong> paragraph.</p>
      </article>
    </main>
  </body>
</html>
```

### CSS

```css
:root {
  --color-primary: #3b82f6;
  --color-secondary: #64748b;
  --spacing-unit: 0.25rem;
  --font-sans: system-ui, -apple-system, sans-serif;
}

.container {
  max-width: min(90vw, 1200px);
  margin-inline: auto;
  padding: calc(var(--spacing-unit) * 4);
}

.card {
  background: linear-gradient(135deg, #fff 0%, #f8fafc 100%);
  border-radius: 0.5rem;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);

  &:hover {
    transform: translateY(-2px);
  }

  & > .card-title {
    font-size: clamp(1rem, 2.5vw, 1.5rem);
  }
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-primary: #60a5fa;
  }
}
```

### SQL

```sql
-- Fetch active users with their order statistics
SELECT
    u.id,
    u.name,
    u.email,
    COUNT(o.id) AS total_orders,
    COALESCE(SUM(o.amount), 0) AS total_spent,
    MAX(o.created_at) AS last_order_date
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
    AND o.status IN ('completed', 'shipped')
WHERE u.active = TRUE
    AND u.created_at >= '2024-01-01'
GROUP BY u.id, u.name, u.email
HAVING COUNT(o.id) > 0
ORDER BY total_spent DESC
LIMIT 100 OFFSET 0;
```

### Shell/Bash

```bash
#!/bin/bash
set -euo pipefail

readonly LOG_DIR="/var/log/app"
readonly MAX_RETRIES=3

log() {
    local level="$1"
    shift
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] $*" >> "$LOG_DIR/app.log"
}

deploy() {
    local environment="${1:-staging}"
    local version="${2:-latest}"

    log "INFO" "Starting deployment to $environment (v$version)"

    for i in $(seq 1 $MAX_RETRIES); do
        if docker pull "myapp:$version" 2>/dev/null; then
            log "INFO" "Successfully pulled image"
            break
        fi
        [ "$i" -eq "$MAX_RETRIES" ] && { log "ERROR" "Failed after $MAX_RETRIES attempts"; exit 1; }
        sleep $((i * 2))
    done

    docker compose -f "docker-compose.$environment.yml" up -d
}

deploy "$@"
```

### JSON

```json
{
  "name": "my-application",
  "version": "2.1.0",
  "private": true,
  "config": {
    "port": 3000,
    "debug": false,
    "features": ["auth", "analytics", "notifications"]
  },
  "database": {
    "host": "localhost",
    "port": 5432,
    "credentials": {
      "username": "app_user",
      "password": null
    }
  },
  "rateLimits": [
    { "endpoint": "/api/*", "requests": 1000, "window": 60 },
    { "endpoint": "/auth/*", "requests": 10, "window": 300 }
  ]
}
```

### YAML

```yaml
version: '3.8'

services:
  api:
    image: myapp:${VERSION:-latest}
    build:
      context: .
      dockerfile: Dockerfile
      args:
        - NODE_ENV=production
    ports:
      - '3000:3000'
    environment:
      DATABASE_URL: postgres://user:pass@db:5432/myapp
      REDIS_URL: redis://cache:6379
      LOG_LEVEL: info
    depends_on:
      db:
        condition: service_healthy
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3
```

### Markdown

````markdown
# Documentation Title

A brief introduction to the **project** with _emphasis_ on key points.

## Installation

Run the following command:

```bash
npm install my-package
```

## Features

- First feature with `inline code`
- Second feature
- Third feature

| Column A | Column B | Column C |
| -------- | -------- | -------- |
| Value 1  | Value 2  | Value 3  |

> Note: This is a blockquote with important information.

For more details, see the [documentation](https://example.com).
````

### Astro

```astro
---
import Layout from '../layouts/Layout.astro'
import Card from '../components/Card.astro'

interface Props {
  title: string
  items: Array<{ id: number; name: string }>
}

const { title, items = [] } = Astro.props
const publishDate = new Date().toISOString()

const filteredItems = items.filter((item) => item.name.length > 0)
---

<Layout title={title}>
  <main class="container">
    <h1>{title}</h1>
    <time datetime={publishDate}>
      {new Date(publishDate).toLocaleDateString('en-US')}
    </time>

    <ul class="item-grid">
      {
        filteredItems.map((item) => (
          <li>
            <Card id={item.id} name={item.name} />
          </li>
        ))
      }
    </ul>
  </main>
</Layout>

<style>
  .container {
    max-width: 800px;
    margin: 0 auto;
  }
</style>
```

### Vue

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface User {
  id: number
  name: string
  email: string
}

const props = defineProps<{
  initialCount?: number
}>()

const emit = defineEmits<{
  (e: 'update', value: number): void
}>()

const count = ref(props.initialCount ?? 0)
const user = ref<User | null>(null)

const doubled = computed(() => count.value * 2)

const increment = () => {
  count.value++
  emit('update', count.value)
}

onMounted(async () => {
  const res = await fetch('/api/user')
  user.value = await res.json()
})
</script>

<template>
  <div class="counter">
    <p v-if="user">Welcome, {{ user.name }}</p>
    <p>Count: {{ count }} (doubled: {{ doubled }})</p>
    <button @click="increment">Increment</button>
  </div>
</template>

<style scoped>
.counter {
  padding: 1rem;
}
</style>
```

### Svelte

```svelte
<script lang="ts">
  import { onMount } from "svelte";

  export let title: string;
  export let initialValue = 0;

  let count = initialValue;
  let items: string[] = [];

  $: doubled = count * 2;
  $: if (count > 10) {
    console.log("Count exceeded 10!");
  }

  async function loadItems() {
    const res = await fetch("/api/items");
    items = await res.json();
  }

  onMount(() => {
    loadItems();
  });
</script>

<main>
  <h1>{title}</h1>

  <p>Count: {count} (doubled: {doubled})</p>
  <button on:click={() => count++}>Increment</button>

  {#if items.length > 0}
    <ul>
      {#each items as item, i (item)}
        <li>{i + 1}. {item}</li>
      {/each}
    </ul>
  {:else}
    <p>No items loaded</p>
  {/if}
</main>

<style>
  main {
    padding: 1rem;
  }
</style>
```
