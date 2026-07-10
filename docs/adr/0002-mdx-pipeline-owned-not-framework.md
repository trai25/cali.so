# MDX pipeline is a thin owned layer, not a content framework

Content is loaded with `fs`, frontmatter validated with zod, and compiled via `next-mdx-remote`'s RSC path with shiki for code blocks — roughly 150 lines we fully control. We deliberately rejected content frameworks (Velite, Contentlayer-style tools) because v2 tracks a preview release of Next.js, and a third-party content layer that lags the framework is exactly how Contentlayer died. Don't "upgrade" this to a framework without revisiting that risk.
