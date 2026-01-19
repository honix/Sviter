# Mermaid Diagrams

This wiki supports [Mermaid](https://mermaid.js.org/) diagrams. Use fenced code blocks with the `mermaid` language identifier.

## Basic Flowchart

```mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do Something]
    B -->|No| D[Do Something Else]
    C --> E[End]
    D --> E
```

## Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant Wiki
    participant AI

    User->>Wiki: Edit page
    Wiki->>AI: Request assistance
    AI-->>Wiki: Suggestions
    Wiki-->>User: Display changes
```

## Entity Relationship Diagram

```mermaid
erDiagram
    PAGE ||--o{ REVISION : has
    PAGE {
        string path
        string title
        string content
    }
    REVISION {
        string commit_hash
        datetime timestamp
        string author
    }
```

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Review
    Review --> Published
    Review --> Draft : Needs changes
    Published --> Archived
    Archived --> [*]
```

## Pie Chart

```mermaid
pie title Wiki Content Types
    "Markdown" : 70
    "TSX Views" : 20
    "CSV Data" : 10
```

## Gantt Chart

```mermaid
gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Planning
    Research       :a1, 2024-01-01, 7d
    Design         :a2, after a1, 5d
    section Development
    Implementation :a3, after a2, 14d
    Testing        :a4, after a3, 7d
```

## Usage Tips

1. **Edit mode**: Shows raw mermaid code for editing
2. **View mode**: Renders the diagram as SVG
3. **Syntax errors**: Invalid syntax displays an error message with details
4. **Responsive**: Diagrams scale to fit the container width

## More Examples

See the [Mermaid documentation](https://mermaid.js.org/syntax/flowchart.html) for complete syntax reference.
