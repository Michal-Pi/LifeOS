# Expert Council User Guide

## Overview

Expert Council runs multiple models in parallel, then synthesizes a consensus answer. Use it for
complex decisions, high-stakes planning, or when multiple perspectives matter.

## When to Use It

- Complex tradeoffs or ambiguous requirements
- High-impact decisions that benefit from multiple perspectives
- Requests that need consensus and peer review

## Configuration

### Council Models

- Add 2+ models for the council stage.
- Mix providers for diversity of viewpoints.
- Balance cost and quality by mixing stronger and lighter models.

### Chairman Model

- The chairman synthesizes the final response.
- Pick the strongest model you can afford for final quality.

### Judges (Optional)

- Judges score and rank responses in full mode.
- By default, judges mirror the council list unless overridden.

## Execution Modes

- **Full**: Council + judges + chairman. Highest quality, highest cost.
- **Quick**: Council + chairman. Faster, cheaper, still strong.
- **Single**: Council only. Lowest cost, no synthesis.
- **Custom**: Use a custom mix of stages (if enabled).

## Interpreting Metrics

- **Consensus Score**: Agreement across judges (0-100).
- **Kendall's Tau**: Ranking correlation between judges (-1 to 1).
- **Borda Ranking**: Aggregated ordering of responses.
- **Ranking Completeness**: Percent of responses consistently ranked.

## Best Practices

- Keep council size between 3-5 for strong signal without excessive cost.
- Use a lightweight judge model when cost matters.
- Watch ranking completeness; low completeness can signal inconsistent judge output.
- Use the cache option for repeated prompts with stable context.
