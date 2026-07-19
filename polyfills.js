{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "diagram.schema.json",
  "title": "Interface Diagram Configuration",
  "type": "object",
  "additionalProperties": false,
  "required": ["nodes", "edges", "processes"],
  "definitions": {
    "id": {
      "type": "string",
      "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]*$",
      "description": "Identifier: letters, digits, underscore, hyphen. Must start with a letter or digit."
    },
    "point": {
      "type": "object",
      "additionalProperties": false,
      "required": ["x", "y"],
      "properties": {
        "x": { "type": "number" },
        "y": { "type": "number" }
      }
    },
    "size": {
      "type": "object",
      "additionalProperties": false,
      "required": ["w", "h"],
      "properties": {
        "w": { "type": "number", "exclusiveMinimum": 0 },
        "h": { "type": "number", "exclusiveMinimum": 0 }
      }
    },
    "attrs": {
      "type": "object",
      "description": "Free-form key/value attributes. Shown in the hover tooltip. Add future metadata here.",
      "additionalProperties": {
        "type": ["string", "number", "boolean"]
      }
    },
    "port": {
      "type": "string",
      "enum": ["t", "r", "b", "l"],
      "description": "Side of the node the edge attaches to: top, right, bottom, left."
    }
  },
  "properties": {
    "meta": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "title": { "type": "string" },
        "version": { "type": "string" },
        "description": { "type": "string" }
      }
    },
    "groups": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "label", "position", "size"],
        "properties": {
          "id": { "$ref": "#/definitions/id" },
          "label": { "type": "string" },
          "position": { "$ref": "#/definitions/point" },
          "size": { "$ref": "#/definitions/size" },
          "attrs": { "$ref": "#/definitions/attrs" }
        }
      }
    },
    "nodes": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "type", "label", "position"],
        "properties": {
          "id": { "$ref": "#/definitions/id" },
          "type": {
            "type": "string",
            "enum": ["ui", "service", "database", "broker", "etl", "auth", "file", "external", "user"]
          },
          "label": { "type": "string" },
          "position": {
            "$ref": "#/definitions/point",
            "description": "Absolute canvas coordinates, even for nodes inside a group."
          },
          "group": {
            "$ref": "#/definitions/id",
            "description": "Optional id of a group this node belongs to."
          },
          "size": { "$ref": "#/definitions/size" },
          "attrs": { "$ref": "#/definitions/attrs" }
        }
      }
    },
    "edges": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "source", "target"],
        "properties": {
          "id": { "$ref": "#/definitions/id" },
          "source": { "$ref": "#/definitions/id" },
          "target": { "$ref": "#/definitions/id" },
          "label": { "type": "string" },
          "sourcePort": { "$ref": "#/definitions/port" },
          "targetPort": { "$ref": "#/definitions/port" },
          "direction": {
            "type": "string",
            "enum": ["one", "both"],
            "description": "Arrowheads: one (default, at target only) or both (double-headed)."
          },
          "waypoints": {
            "type": "array",
            "items": { "$ref": "#/definitions/point" },
            "description": "Optional absolute canvas coordinates the edge is routed through, in order."
          },
          "attrs": { "$ref": "#/definitions/attrs" }
        }
      }
    },
    "processes": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "name", "nodes"],
        "properties": {
          "id": { "$ref": "#/definitions/id" },
          "name": { "type": "string" },
          "color": {
            "type": "string",
            "pattern": "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$",
            "description": "Highlight color as a hex value, e.g. #2563eb."
          },
          "description": { "type": "string" },
          "nodes": {
            "type": "array",
            "minItems": 1,
            "items": { "$ref": "#/definitions/id" }
          },
          "edges": {
            "type": "array",
            "items": { "$ref": "#/definitions/id" },
            "description": "Optional. If omitted, all edges whose two endpoints are both member nodes are included."
          },
          "attrs": { "$ref": "#/definitions/attrs" }
        }
      }
    }
  }
}
