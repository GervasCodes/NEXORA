# API Reference

This file is being built up incrementally as endpoints get documented.
See each module's `*.routes.js` for the full, authoritative route list
in the meantime.

## Admin — Dispatch dashboard (Phase 6)

### `GET /admin/dispatch`

Auth: `admin` or `super_admin` (same gate as the rest of `/admin/*`).

One combined read powering the admin dispatch dashboard.

**Response `data` shape:**

```json
{
  "deliveries": [
    {
      "id": 1,
      "order_id": 10,
      "agent_id": 5,
      "status": "in_transit",
      "delivery_fee": 4000,
      "distance_km": 6,
      "estimated_duration_minutes": 18,
      "assigned_at": "2026-07-21T09:00:00.000Z",
      "minutes_elapsed": 25,
      "is_delayed": true,
      "order_number": "ORD-1001",
      "shipping_city": "Dar es Salaam",
      "agent_first_name": "Amina",
      "agent_current_lat": -6.81,
      "agent_current_lng": 39.21
    }
  ],
  "agents": [
    {
      "id": 5,
      "first_name": "Amina",
      "current_lat": -6.81,
      "current_lng": 39.21,
      "active_delivery_count": 1
    }
  ],
  "delayed": [ /* subset of deliveries where is_delayed is true */ ],
  "summary": {
    "active_deliveries": 1,
    "delayed_deliveries": 1,
    "online_agents": 1,
    "idle_agents": 0
  }
}
```

`is_delayed` compares real elapsed time since assignment against the
road-routing ETA snapshot taken at assignment time
(`estimated_duration_minutes`) - that snapshot deliberately never
changes as the agent moves, so it stays a stable "were we on time"
baseline.

### Socket.IO events (room: `admins`)

Admin/super_admin sockets auto-join the `admins` room on connect (see
`backend/src/socket/socket.js`). No extra `join_*` call is needed.

| Event | Payload | Fired when |
|---|---|---|
| `dispatch:delivery_assigned` | `{ orderId, deliveryId?, agentId }` | A delivery is claimed manually or a matching offer is accepted |
| `dispatch:delivery_status` | `{ orderId, deliveryId, status }` | A delivery's status changes (picked up / in transit / delivered / failed) |
| `dispatch:agent_status` | `{ agentId, isOnline }` | An agent goes on/off shift |
| `dispatch:agent_position` | `{ agentId, lat, lng, timestamp }` | An online agent's location ping |

The dashboard treats `dispatch:delivery_assigned` / `dispatch:delivery_status`
/ `dispatch:agent_status` as "something changed, re-fetch `GET /admin/dispatch`"
triggers (so delay flags and summary counts, computed server-side, never
drift), and applies `dispatch:agent_position` directly to the matching
agent's row instead.
