
## Response Examples

Show API response examples for different scenarios.

### Success and Error Responses

```mdx
<ResponseExample>
```json Success (200)
{
  "id": "usr_abc123",
  "email": "user@example.com",
  "name": "John Doe",
  "created_at": "2024-01-15T10:30:00Z",
  "is_verified": true
}
```

```json Error (400)
{
  "error": {
    "code": "validation_error",
    "message": "Invalid email format",
    "details": {
      "field": "email",
      "value": "invalid-email"
    }
  }
}
```

```json Error (401)
{
  "error": {
    "code": "unauthorized",
    "message": "Invalid or expired API key"
  }
}
```

```json Error (404)
{
  "error": {
    "code": "not_found",
    "message": "User with ID 'usr_abc123' not found"
  }
}
```
</ResponseExample>
```

### Paginated Response

```mdx
<ResponseExample>
```json Success (200)
{
  "data": [
    {
      "id": "usr_001",
      "name": "Alice Smith",
      "email": "alice@example.com"
    },
    {
      "id": "usr_002",
      "name": "Bob Jones",
      "email": "bob@example.com"
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 10,
    "total": 45,
    "total_pages": 5
  },
  "links": {
    "first": "https://api.example.com/users?page=1",
    "last": "https://api.example.com/users?page=5",
    "next": "https://api.example.com/users?page=2",
    "prev": null
  }
}
```
</ResponseExample>
```

## API Playground

Interactive API playground modes.

### Interactive Mode (default)

Full interactive playground with request builder and live testing.

```json
{
  "api": {
    "playground": {
      "display": "interactive"
    }
  }
}
```

Features:
- Live API requests from browser
- Parameter input fields
- Authentication management
- Response preview
- Copy as code snippets

### Simple Mode

Simplified playground with basic request/response display.

```json
{
  "api": {
    "playground": {
      "display": "simple"
    }
  }
}
```

### Disabled Playground

Hide playground completely.

```json
{
  "api": {
    "playground": {
      "display": "none"
    }
  }
}
```

### Playground Proxy

Route API requests through proxy server (bypass CORS).

```json
{
  "api": {
    "playground": {
      "proxy": "https://cors-proxy.example.com"
    }
  }
}
```

## Code Example Languages

Configure supported languages for code examples.

```json
{
  "api": {
    "examples": {
      "languages": [
        "bash",
        "python",
        "javascript",
        "typescript",
        "go",
        "ruby",
        "php",
        "java",
        "swift",
        "csharp",
        "kotlin",
        "rust"
      ]
    }
  }
}
```

### Default Libraries

Set default library/method per language.

```json
{
  "api": {
    "examples": {
      "defaults": {
        "bash": "curl",
        "python": "requests",
        "javascript": "fetch",
        "go": "http"
      }
    }
  }
}
```

### Prefill Values

Pre-fill common values in code examples.

```json
{
  "api": {
    "examples": {
      "prefill": {
        "apiKey": "sk_test_abc123",
        "baseUrl": "https://api.example.com",
        "userId": "usr_example"
      }
    }
  }
}
```

Values replace placeholders in examples:
- `{apiKey}` → `sk_test_abc123`
- `{baseUrl}` → `https://api.example.com`
- `{userId}` → `usr_example`

### Auto-generate Examples

Automatically generate code examples from OpenAPI spec.

```json
{
  "api": {
    "examples": {
      "autogenerate": true
    }
  }
}
```

## SDK Integration

### Speakeasy SDK

Integrate Speakeasy-generated SDKs.

```mdx
---
title: "Create User"
openapi: "POST /users"
---

<CodeGroup>
```typescript TypeScript SDK
import { SDK } from '@company/sdk';

const sdk = new SDK({ apiKey: 'YOUR_API_KEY' });

const user = await sdk.users.create({
  email: 'user@example.com',
  name: 'John Doe'
});
```

```python Python SDK
from company_sdk import SDK

sdk = SDK(api_key='YOUR_API_KEY')

user = sdk.users.create(
    email='user@example.com',
    name='John Doe'
)
```
</CodeGroup>
```

### Stainless SDK

Integrate Stainless-generated SDKs.

```mdx
<CodeGroup>
```typescript TypeScript SDK
import { CompanyAPI } from 'company-api';

const client = new CompanyAPI({
  apiKey: process.env.COMPANY_API_KEY
});

const user = await client.users.create({
  email: 'user@example.com',
  name: 'John Doe'
});
```
</CodeGroup>
```

## Complete API Endpoint Example

Full example of documented API endpoint.

```mdx
---
title: "Create User"
description: "Create a new user account"
openapi: "POST /users"
---

Creates a new user with the provided information. Email must be unique.

## Request

<ParamField body="email" type="string" required>
  User's email address (must be unique)
</ParamField>

<ParamField body="name" type="string" required>
  Full name of the user
</ParamField>

<ParamField body="password" type="string" required>
  User's password (minimum 8 characters)
</ParamField>

<ParamField body="role" type="string" default="user" enum={["user", "admin", "moderator"]}>
  User's role in the system
</ParamField>

## Response

<ResponseField name="id" type="string" required>
  Unique identifier of the created user
</ResponseField>

<ResponseField name="email" type="string" required>
  User's email address
</ResponseField>

<ResponseField name="name" type="string" required>
  User's full name
</ResponseField>

<ResponseField name="role" type="string" required>
  User's assigned role
</ResponseField>

<ResponseField name="created_at" type="timestamp" required>
  ISO 8601 timestamp of creation
</ResponseField>

<RequestExample>
```bash cURL
curl -X POST https://api.example.com/users \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "name": "John Doe",
    "password": "SecurePass123",
    "role": "user"
  }'
```

```python Python
import requests

response = requests.post(
    "https://api.example.com/users",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "email": "john@example.com",
        "name": "John Doe",
        "password": "SecurePass123",
        "role": "user"
    }
)
```
</RequestExample>

<ResponseExample>
```json Success (201)
{
  "id": "usr_abc123",
  "email": "john@example.com",
  "name": "John Doe",
  "role": "user",
  "created_at": "2024-01-15T10:30:00Z"
}
```

```json Error (400)
{
  "error": {
    "code": "validation_error",
    "message": "Email already exists",
    "field": "email"
  }
}
```
</ResponseExample>
```
