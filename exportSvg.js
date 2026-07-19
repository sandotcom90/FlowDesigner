{
  "meta": {
    "title": "Flow Designer",
    "version": "1.0",
    "description": "Interface diagram — sample configuration"
  },
  "groups": [
    {
      "id": "grp-etl",
      "label": "ETL Layer",
      "position": { "x": 240, "y": 380 },
      "size": { "w": 470, "h": 190 }
    }
  ],
  "nodes": [
    {
      "id": "enduser",
      "type": "user",
      "label": "End User",
      "position": { "x": -180, "y": 68 },
      "attrs": { "channel": "web & mobile" }
    },
    {
      "id": "webui",
      "type": "ui",
      "label": "Web Portal",
      "position": { "x": 40, "y": 70 },
      "attrs": { "owner": "Channel Team", "tech": "Angular 17" }
    },
    {
      "id": "gateway",
      "type": "service",
      "label": "API Gateway",
      "position": { "x": 270, "y": 70 },
      "attrs": { "tech": "Spring Cloud", "sla": "99.95%" }
    },
    {
      "id": "auth",
      "type": "auth",
      "label": "Auth Service",
      "position": { "x": 270, "y": 230 },
      "attrs": { "protocol": "OIDC", "provider": "Keycloak" }
    },
    {
      "id": "kafka",
      "type": "broker",
      "label": "Kafka",
      "position": { "x": 520, "y": 210 },
      "attrs": { "cluster": "3 brokers", "topic": "payments.posted" }
    },
    {
      "id": "posting",
      "type": "service",
      "label": "Posting Engine",
      "position": { "x": 740, "y": 210 },
      "attrs": { "tech": "Java 21" }
    },
    {
      "id": "coredb",
      "type": "database",
      "label": "Core DB",
      "position": { "x": 760, "y": 40 },
      "attrs": { "tech": "Oracle 19c", "owner": "DBA Team" }
    },
    {
      "id": "feed",
      "type": "file",
      "label": "Upstream Feed",
      "position": { "x": 40, "y": 430 },
      "attrs": { "transport": "SFTP", "schedule": "22:00 EST" }
    },
    {
      "id": "spark",
      "type": "etl",
      "label": "Spark Batch",
      "position": { "x": 280, "y": 450 },
      "group": "grp-etl",
      "attrs": { "tech": "Spark 3.5", "cluster": "OpenShift" }
    },
    {
      "id": "dq",
      "type": "etl",
      "label": "DQ Engine",
      "position": { "x": 500, "y": 450 },
      "group": "grp-etl",
      "attrs": { "checks": 42 }
    },
    {
      "id": "warehouse",
      "type": "database",
      "label": "Warehouse",
      "position": { "x": 780, "y": 430 },
      "attrs": { "tech": "PostgreSQL 16" }
    }
  ],
  "edges": [
    { "id": "e-user-ui", "source": "enduser", "target": "webui", "label": "uses" },
    { "id": "e-ui-gw", "source": "webui", "target": "gateway", "label": "HTTPS" },
    {
      "id": "e-gw-auth",
      "source": "gateway",
      "target": "auth",
      "label": "OIDC",
      "sourcePort": "b",
      "targetPort": "t"
    },
    { "id": "e-gw-db", "source": "gateway", "target": "coredb", "label": "JDBC", "direction": "both" },
    {
      "id": "e-gw-kafka",
      "source": "gateway",
      "target": "kafka",
      "label": "publish",
      "sourcePort": "b",
      "targetPort": "l",
      "waypoints": [{ "x": 340, "y": 245 }, { "x": 460, "y": 245 }]
    },
    { "id": "e-kafka-post", "source": "kafka", "target": "posting", "label": "consume" },
    {
      "id": "e-post-db",
      "source": "posting",
      "target": "coredb",
      "sourcePort": "t",
      "targetPort": "b",
      "label": "commit"
    },
    { "id": "e-feed-spark", "source": "feed", "target": "spark", "label": "SFTP" },
    { "id": "e-spark-dq", "source": "spark", "target": "dq" },
    { "id": "e-dq-wh", "source": "dq", "target": "warehouse", "label": "load" },
    {
      "id": "e-db-spark",
      "source": "coredb",
      "target": "spark",
      "label": "extract",
      "sourcePort": "b",
      "targetPort": "t",
      "waypoints": [{ "x": 820, "y": 350 }, { "x": 350, "y": 350 }]
    }
  ],
  "processes": [
    {
      "id": "login",
      "name": "User Login",
      "color": "#2563eb",
      "description": "Portal sign-in via the gateway with OIDC token issuance, then session lookup in Core DB.",
      "nodes": ["enduser", "webui", "gateway", "auth", "coredb"],
      "edges": ["e-user-ui", "e-ui-gw", "e-gw-auth", "e-gw-db"]
    },
    {
      "id": "payment",
      "name": "Payment Posting",
      "color": "#c2410c",
      "description": "A payment captured in the portal is published to Kafka, consumed by the posting engine and committed to Core DB.",
      "nodes": ["enduser", "webui", "gateway", "kafka", "posting", "coredb"],
      "edges": ["e-user-ui", "e-ui-gw", "e-gw-kafka", "e-kafka-post", "e-post-db"]
    },
    {
      "id": "eod-batch",
      "name": "EOD Batch Load",
      "color": "#0f766e",
      "description": "Nightly SFTP feed and a Core DB extract are transformed by Spark, quality-checked, and loaded to the warehouse.",
      "nodes": ["feed", "coredb", "spark", "dq", "warehouse"],
      "edges": ["e-feed-spark", "e-db-spark", "e-spark-dq", "e-dq-wh"]
    }
  ]
}
