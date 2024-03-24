---
title: Test 2
date: 2023-03-20
draft: true
tags:
  - test
  - asdfasdf
---

# Test

hello this is a test

- a
- b
- c

```javascript
/**
 * Paginates an array of data.
 */
export function paginate(data: any[], { page = 1, limit = 10 }) {
	if (limit) {
		return data.slice((page - 1) * limit, page * limit);
	}

	return data;
}
```
