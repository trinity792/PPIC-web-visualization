Document Structure:
- General Billing Types (and what they include)
	- Monthly subscriptions
	- Per Token API calls
- Use Cases
	- Search Engines
	- Coding/Technical
	- Source Gathering
	- Source Synthesis/Deep Research
	- Everything Else
- Companies and Their Models
	- Company
		- Model
			- Marketed Users
			- Privacy
			- Pros
			- Cons
			- Costs
			- Recommended Uses
- What are Local Hosted LLM's?
- Hardware Requirements and Limitations
- Prompt Engineering
- Maintaining Reliability and Institutional Integrity
---
# Introduction
## Executive Summary
## Billing Types
### Monthly Subscription
Most AI companies offer a monthly or annual subscription plan. What's included varies by company and tier. For example, ChatGPT Plus and Claude Pro subscriptions include access to the web-based chat interface, the ability to connect to external tools, and the ability to build and implement agentic workflows. Specific features and limits for each plan are described later in this document under each company's section.
The main drawback of subscriptions is rate limiting. Each company sets a cap on how many messages you can send within a given time window before you're required to wait. These limits are often unspecified because capacity scales dynamically based on prompt complexity, conversation length, and tool use. To illustrate: you could ask a model 100 simple single-sentence questions without coming close to the limit. However, asking a model to review the past 75 years of economic trends, evaluate their effects on societies around the world, and then write a comprehensive 10,000-word report on those findings would likely hit or approach the limit in a single prompt. This is because more complex prompts require higher reasoning; that example requires the model to search for and review a large dataset, synthesize it, search for quantitative reports, evaluate cause and effect, and structure a long-form output.
### By Usage
Per-usage billing charges you for the "tokens" you consume rather than a flat monthly fee. Users typically interact with models through a terminal or within an IDE rather than a web chat interface. This billing model is most common in "agentic" workflows, where different models interact with each other and perform tasks autonomously.
AI tokens are essentially units of data that AI models use to process and generate language. Instead of reading whole words, AI models break down text into smaller chunks called tokens. A token can be an entire word, a portion of a word, punctuation, or an emoji.

>[!info] Context Window (Memory): 
>AI models have a maximum "context window," which is the total number of tokens the model can read and remember in a single interaction. This includes your prompt, the entire chat history, documents you have uploaded, and the AI's response. If your conversation exceeds this limit, the model will forget the earliest parts of the chat.

Per-usage billing can be cheaper than a subscription if you use a lower-tiered model and keep prompts simple. However, costs for complex prompts that require higher-tiered models can escalate quickly:

> [!info] One Million USD
> cybersecurity company Palo Alto Networks Inc. used Anthropic's Mythos AI model to check its code for vulnerabilities and ended up burning through $1 million in tokens "very quickly," a company executive told the Information news site.
The tradeoff is a steeper learning curve. Per-usage billing is most commonly used by programmers building agentic workflows and then letting the models execute specified tasks. In return, it offers more control over model behavior and slightly more explainability in how outputs are generated.

---
## Use Cases
### Search Engine & Source Gathering
Using AI as an alternative or supplement to traditional search engines for finding information, answering factual questions, and collecting sources for research.
#### What this looks like in practice:
Unlike a traditional search engine that returns a list of links, AI models can interpret a complex question, search the web, and return a synthesized answer with cited sources. You can ask follow-up questions to refine the results without starting a new search. This also extends to systematic source collection where you ask a model to find government reports, academic papers, or datasets on a specific topic and return them organized by relevance, date, or methodology.
#### Where it works well:
- Finding and compiling government data sources, legislative text, or agency reports across multiple jurisdictions.
- Explaining complex concepts or systems with technical terms into plain language and vice versa.
#### Limitations to be aware of:
- **Citation accuracy varies significantly between models.** Some models hallucinate sources that don't exist. Always verify that a cited source actually exists before using it.
- **Recency depends on the model.** Even though most AI subscriptions include web search by default, some models have a knowledge cutoff and can only search the web if that feature is enabled or available.
- **Not a replacement for systematic literature reviews.** AI search is useful for scoping and discovery, but it does not guarantee comprehensive coverage of a field. It may surface popular or frequently-cited sources while missing niche or recent publications.
- **Good research capabilities require high reasoning.** Some models have a "reasoning" or "effort" slider/toggle that allows you to set how much effort the model puts in. Higher reasoning will use more tokens.
#### Models with strong search capabilities:
Perplexity (purpose-built for this), ChatGPT, Claude, Gemini
### Coding/Technical
Using AI to write, debug, explain, or refactor code – from short scripts to complex data pipelines and analysis workflows.
#### What this looks like in practice:
AI models can generate working code from natural language descriptions, explain what existing code does line-by-line, identify and fix bugs, and convert code between languages or frameworks. For data-driven organizations, this is particularly relevant for automating repetitive data processing tasks, writing analysis scripts, cleaning messy datasets, and building visualizations.
#### Where it works well:
- Writing data cleaning and transformation scripts (e.g., standardizing inconsistent geographic names across datasets, reshaping wide-format data to long-format)
- Generating visualization code for charts and dashboards
- Debugging errors in existing scripts where you can paste an error message and the relevant code, and the model will typically identify the issue and suggest a fix
- Translating working code from one language to another (e.g., Stata to Python, R to Python)
- Explaining unfamiliar codebases or inherited scripts written by former staff
#### Limitations to be aware of:
- **Someone must be able to evaluate the output.** AI-generated code can contain subtle bugs, use deprecated functions, or produce results that look correct but are logically wrong (e.g., an aggregation that silently drops null values). A user with enough technical knowledge to review and test the output is essential.
- **Context matters.** Models perform best when given specific, well-described tasks. Vague prompts produce generic code that may not fit the actual data or requirements.
- **Security considerations.** Pasting proprietary data or credentials into a model's interface may violate data handling policies. 
- **Models are poor program architects.** You must know how to structure programs, outline data contracts, style guides, and user flows. Models struggle to structure an entire multi-purpose codebase project without blueprints. If you are building a house, you are the architecture, designer, and inspector while the model is the construction team.
#### Models with strong coding capabilities:
Claude (Sonnet and Opus), ChatGPT (GPT-5.5), Gemini
### Source Synthesis / Deep Research
Having an AI model read, analyze, and synthesize large volumes of text into structured reports.
#### What this looks like in practice:
Rather than searching for sources, this use case assumes you already have them (or the model gathers them as a first step). You upload PDFs, paste report text, or point the model at URLs, and ask it to compare findings across sources, identify consensus and disagreement, extract specific data points, or produce a structured summary. Several companies now offer dedicated "deep research" modes that automate multi-step research workflows: the model formulates sub-questions, searches for sources, reads them, and produces a report – a process that can take several minutes rather than seconds.
#### Where it works well:
- Synthesizing findings across multiple lengthy reports (e.g., comparing how five state agencies define and measure housing affordability)
- Extracting structured data from unstructured text (e.g., pulling program eligibility thresholds from legislative text into a comparison table)
- Summarizing long documents while preserving key quantitative claims and methodology details
- Identifying themes or patterns across a set of qualitative sources
#### Limitations to be aware of:
- **Context window limits are real.** Every model has a maximum amount of text it can "hold in memory" at once (see the Context Window explanation in the Billing Types section). If you upload more text than the model can process, it will either refuse, silently truncate, or lose track of earlier material. When the model loses track of the earlier information you get "context rot" where the quality of the output decreases sharply and hallucinations increase. This is especially relevant when working with multiple long reports simultaneously. 
- **Nuance gets flattened.** Models tend to produce clean, confident summaries even when the underlying sources are ambiguous, contested, or heavily caveated. The synthesis may read as more definitive than the evidence warrants.
- **Verification is non-negotiable.** Any specific claim, statistic, or quote in a model-generated synthesis should be verified against the original source. Models can misattribute findings, combine numbers from different contexts, or subtly reframe an author's argument.
#### Models/tools with strong synthesis capabilities:
Claude (long context window, strong document analysis), ChatGPT Deep Research, Gemini Deep Research, Google NotebookLM (designed specifically for working with uploaded sources)
### Everything Else
The categories above cover the use cases most immediately relevant to research and policy work, but AI models are general-purpose tools. Other common applications include drafting and editing written content, translating between languages, summarizing meetings or long email threads, and brainstorming approaches to a problem. These uses are typically workflow-dependent and most people discover them organically as they use the tools more.

---
# Companies and Their Models
This section covers the major AI providers, their model lineups, and how they handle your data. Pricing and model names change frequently, so treat specific figures as approximate. This section was last updated on June 29, 2026.
A note on privacy that applies across all providers: the consumer/enterprise divide is important, but consumer defaults are not uniform. Google may use future Gemini chats to improve its services when Keep Activity is on, and OpenAI uses consumer ChatGPT conversations for training by default unless the user opts out. Anthropic generally uses consumer Claude conversations for model improvement only if the user chooses to allow it, with separate exceptions for submitted feedback and conversations flagged for safety review. Business, enterprise, and API offerings generally exclude customer data from model training by default, but organizations should confirm the terms for the specific product and plan they use.
## Google
### Gemini
Gemini is Google's flagship AI model family and the primary competitor to ChatGPT and Claude. It powers the Gemini chatbot (formerly Bard) as well as AI features embedded across Google Workspace (Gmail, Docs, Sheets, Slides). Gemini models are multimodal, meaning they can process text, images, audio, and video within a single conversation.
#### Marketed Users
Google markets Gemini broadly: to individual consumers through the free Gemini app, to students and educators, and to businesses through Google Workspace and Google Cloud. The tightest integration is with existing Google users. If an organization already uses Google Workspace, Gemini is the most natural AI addition because it can read and act on your Gmail, Drive, Docs, and Calendar data without requiring you to upload anything manually. Google also markets Gemini heavily toward enterprise and developer audiences through its Cloud and Vertex AI platforms.
#### Model Tiers
- **Gemini 3.5 Flash** is the fast model available across the free and paid Gemini app plans. It is designed for everyday work, coding, and agentic tasks.
- **Gemini 3.1 Pro** is Google's more capable reasoning model for complex analytical tasks. Access limits vary by plan.
- **Deep Think** is a reasoning-focused mode available on Google AI Ultra. It works through complex, multi-step problems before generating a response.
#### Pros
- Deep integration with Google Workspace means Gemini can draft emails, summarize documents, and pull calendar context without manual uploads.
- Google AI Pro and Ultra provide a 1-million-token context window in the Gemini app, allowing them to process long documents or large codebases in a single conversation.
- Google's Deep Research mode produces thorough, multi-source reports with citations.
- NotebookLM (described below) is a free, standalone tool for source-based analysis that has no direct equivalent from other providers.
- Enterprise privacy protections are strong and well-documented, backed by Google Cloud's compliance infrastructure.
#### Cons
- Consumer privacy requires active management. Keep Activity is on by default for adult users, while turning it off prevents future chats from appearing in Gemini Apps Activity and makes some Connected Apps, including Google Workspace, unavailable.
- Human reviewers may read consumer-tier conversations. Google explicitly advises users not to enter confidential information.
- Google's AI product lineup is fragmented across Gemini, NotebookLM, AI Studio, Vertex AI, and Workspace integrations, which can be confusing when trying to determine which tool fits a specific need.
#### Privacy
For consumer Gemini accounts, future chats may be used to provide, develop, and improve Google services, including training generative AI models, when Keep Activity is on. Human reviewers may read a subset of chats, and Google advises users not to enter confidential information they would not want reviewed or used to improve its services. When Keep Activity is off, future chats do not appear in Gemini Apps Activity and are not used to train Google's AI models unless the user submits feedback. Google still retains those chats for 72 hours to provide and protect the service. Temporary Chats are also retained for 72 hours and are not used to train Google's AI models. Turning off Keep Activity makes some Connected Apps unavailable, including Google Workspace on the web and iOS.
Google Workspace and Google Cloud (Vertex AI) operate under entirely different terms. Google contractually commits that enterprise customer data, including prompts, responses, and organizational files, is not used to train its foundation models. Enterprise deployments include compliance certifications such as SOC 2 Type II, ISO 27001/27017/27018, FedRAMP, and HIPAA eligibility (with a Business Associate Agreement for qualifying customers).
#### Costs
A free tier is available with limited features. In the United States, Google AI Plus is $4.99/month, Google AI Pro is $19.99/month, and Google AI Ultra starts at $99.99/month for 5x the Pro usage limits or $199.99/month for 20x the Pro limits. Prices and included benefits vary by country.
#### Recommended Uses
General research, document summarization within Google Workspace, deep research mode for multi-source synthesis, and tasks that benefit from tight integration with Gmail, Drive, and Docs.
#### NotebookLM
NotebookLM is a separate Google product designed specifically for working with uploaded source material. You provide documents (PDFs, Google Docs, web links, YouTube videos), and NotebookLM indexes them into a "notebook" that you can query, summarize, and cross-reference. It does not search the open web; it only works with the sources you give it.
NotebookLM is free to use. It is particularly strong for literature reviews, comparing policy documents, and building structured summaries from a defined set of sources. Its "Audio Overview" feature can generate a podcast-style discussion of your uploaded materials.
### Gemma
Gemma is Google's open-source model family. Unlike Gemini, Gemma models are designed for developers and researchers who want to run AI locally or customize it for specific applications. Gemma models are smaller, free to download, and can run on consumer hardware.
### Other Google AI Products
Google also offers several specialized AI models that are not general-purpose chatbots:
- **Nano Banana** is Google's AI image generation and editing model, integrated into the Gemini app. It can create, edit, and restyle images from text prompts.
- **Veo** is a video generation model that creates short video clips from text or image prompts.
- **Lyria** is a music generation model that can produce audio tracks from text descriptions.
These are creative tools rather than research or productivity assistants, and are unlikely to be central to most policy work.
## OpenAI
### ChatGPT (GPT Models)
ChatGPT is the product that popularized consumer-facing AI. It is developed by OpenAI and powered by the GPT model family. As of mid-2026, ChatGPT has over 400 million weekly active users and remains the most widely used AI chatbot.
#### Marketed Users
OpenAI markets ChatGPT to essentially everyone. The free tier targets casual individual users. ChatGPT Plus ($20/month) and Pro ($200/month) target power users, professionals, and researchers who need access to the strongest models and features. Business and Enterprise plans target organizations that need shared workspaces, admin controls, and data privacy guarantees. OpenAI has also expanded into education (ChatGPT Edu) and is increasingly targeting developers through its API and the Codex coding agent. ChatGPT's user base is the broadest of any AI platform, spanning students, writers, researchers, engineers, and business professionals across nearly every industry.
#### Model Tiers
- **GPT-5.5 Instant** is the default model for most ChatGPT conversations and is optimized for fast, general-purpose work.
- **GPT-5.5 Thinking** spends more time reasoning through complex analysis, math, and coding tasks. It is available to Plus, Pro, Business, and Enterprise users.
- **GPT-5.5 Pro** is the highest-accuracy ChatGPT option for especially difficult work and is available to Pro, Business, and Enterprise users.
GPT-4.5 is no longer available in ChatGPT as of June 26, 2026. Existing conversations that used GPT-4.5 continue with GPT-5.5; this retirement does not apply to the API.
ChatGPT also includes built-in features beyond the base model: web search, image generation (via DALL-E), file uploads and analysis, a "Canvas" editor for collaborative writing and coding, custom GPTs (preconfigured assistants for specific tasks), and persistent memory across conversations.
#### Pros
- The largest feature set of any AI chatbot. Memory, custom GPTs, Canvas, image generation, voice mode, file analysis, and a growing ecosystem of third-party integrations are all built in.
- The most flexible standalone AI workspace. Because ChatGPT is not tied to a specific productivity suite (unlike Copilot with Microsoft 365 or Gemini with Google Workspace), it works equally well regardless of what other software an organization uses.
- GPT-5.5 Thinking and Pro are designed for multi-step logic, math, coding, and careful analytical tasks.
- The largest user community means more tutorials, guides, and shared custom GPTs are available online than for any other platform.
- The free tier is genuinely useful for basic tasks.
#### Cons
- Consumer plans train on your data by default. The opt-out toggle is buried in Settings under Data Controls and is easy to miss.
- ChatGPT has historically been more prone to confident-sounding hallucinations than Claude, particularly when generating citations or specific statistics. This has improved with recent models but remains a concern for research use.
- The sheer number of features and model options can be overwhelming for new users. Choosing among GPT-5.5 Instant, Thinking, and Pro requires some understanding of the speed, usage, and accuracy tradeoffs.
#### Privacy
On free and individual paid plans (Plus at $20/month, Pro at $200/month), OpenAI uses your conversations to train its models by default. You can opt out by navigating to Settings, then Data Controls, then turning off "Improve the model for everyone." Once opted out, new conversations are excluded from training. You can also use Temporary Chat, which is not saved, not used for training, and does not create or use memories.
Business and Enterprise plans do not use customer inputs or outputs for model training by default unless the organization explicitly opts in. Business data is encrypted at rest (AES-256) and in transit (TLS 1.2+), and qualifying organizations can configure custom retention periods. Enterprise plans also include controls such as SAML SSO and support for data processing agreements.
API usage is also excluded from training by default, with standard log retention of approximately 30 days for abuse monitoring.
#### Costs
A free tier is available with limited access to ChatGPT's current models. Paid individual plans start at $20/month (Plus) and go up to $200/month (Pro). ChatGPT Business is $20/user/month when billed annually or $25/user/month when billed monthly. Enterprise pricing is custom.
#### Recommended Uses
General-purpose assistant for writing, research, brainstorming, and coding. GPT-5.5 Thinking and Pro are particularly strong for tasks requiring extended reasoning. ChatGPT's broad feature set (memory, custom GPTs, plugins) makes it the most flexible standalone AI workspace.
## Anthropic
### Claude
Claude is Anthropic's AI model family. Anthropic positions itself as a safety-focused AI company, and Claude is designed with an emphasis on being helpful, harmless, and honest. Claude is known for strong performance on long-document analysis, coding, and nuanced reasoning tasks.
#### Marketed Users
Anthropic markets Claude toward professionals who value careful, nuanced output over raw speed or feature breadth. The primary audiences are researchers and knowledge workers (long-document analysis, policy writing, synthesis), software developers (coding assistance, code review, codebase explanation), and enterprise customers in regulated industries that need strong data governance. Claude has gained particular traction among users who work with lengthy, complex documents and among developers through Claude Code (a terminal-based coding agent). Anthropic also offers Claude for Education and Claude Gov for government use cases.
#### Model Tiers
- **Fable / Mythos** is the most capable tier, launched in June 2026. Fable is the publicly available version with safety classifiers that automatically fall back to Opus on certain sensitive topics (cybersecurity, biology/chemistry). Mythos is the same underlying model with those safety classifiers removed, available only to vetted cybersecurity and research organizations through Anthropic's trusted access program (Project Glasswing). Fable sets the current state of the art on most major AI benchmarks. As of mid-June 2026, access to both Fable and Mythos has been suspended under a US government export control directive.
- **Opus** is the previous top-tier model (currently Opus 4.8), strong at complex reasoning, coding, and extended analysis.
- **Sonnet** is the mid-range model optimized for a balance of capability and speed. It is the default for most Claude interactions and handles everyday tasks well.
- **Haiku** is the fastest, most lightweight model, designed for simple queries and high-volume, low-cost use cases.
#### Pros
- The strongest performance on long-document analysis. Claude's 200K-token context window and its ability to maintain coherence across that span make it the best option for uploading and working with multiple lengthy reports in a single conversation.
- Consistently produces nuanced, carefully reasoned output. Claude is less likely than other models to flatten caveats or present ambiguous evidence as settled fact.
- Strong coding capabilities, particularly through Claude Code and the Sonnet/Opus models.
- The Incognito mode provides a simple, reliable way to have a conversation that is never used for training, without needing to change account-level settings.
- API privacy is the most restrictive among major providers (7-day log retention, no training use by default).
#### Cons
- Fewer built-in features than ChatGPT. Claude does not have a native image generator, a custom GPT equivalent, or as large a third-party integration ecosystem.
- Allowing Anthropic to use consumer chats for model improvement extends retention of that data to five years, which is a significant tradeoff even though the setting is optional.
- Fable/Mythos availability is currently suspended due to a US government export control directive, leaving Opus 4.8 as the top available model.
- The free tier is more limited than ChatGPT's, with lower message caps and fewer features.
- Opus model uses ~2x tokens than Sonnet.
#### Privacy
Consumer accounts (Free, Pro at $20/month, and Max at $100/month) may have chats and coding sessions used to improve Claude only if the user chooses to allow it. Data used for model improvement, including submitted feedback, may be retained for five years. Users can check and change the model-improvement setting in Claude's privacy controls. Claude also offers an Incognito mode (ghost icon) where conversations are never used for training regardless of the main setting.
One caveat: Anthropic's privacy policy notes that conversations flagged by automated safety classifiers may still be used to improve safety detection systems, even if you have opted out of general model training.
Anthropic's June 2026 privacy notice, effective July 8, 2026, says the consumer privacy-policy changes do not apply to Team, Enterprise, the Claude Developer Platform, or other services governed by Anthropic's Commercial Terms. Data from these offerings is not used for model training by default. Enterprise customers can negotiate a Data Processing Addendum for GDPR compliance. HIPAA-eligible services are available for qualifying healthcare customers with a Business Associate Agreement. Zero Data Retention (ZDR) is available for Enterprise customers. API usage operates under commercial terms with 7-day standard log retention (as of September 2025), no training use.
#### Costs
A free tier is available. Paid plans start at $20/month (Pro) and go up to $100/month (Max). Team plans are approximately $25-30/user/month. Enterprise pricing is custom.
#### Recommended Uses
Long-document analysis and synthesis, coding (particularly strong with Opus), nuanced policy writing, and tasks requiring careful attention to context over extended conversations. Claude's large context window (up to 200K tokens on paid plans) makes it especially well-suited for uploading and analyzing multiple lengthy documents at once.
## Microsoft
### Copilot
Microsoft Copilot is not a standalone AI model. It is a suite of AI-powered tools embedded directly into Microsoft 365 applications (Word, Excel, PowerPoint, Outlook, Teams). With Copilot Wave 3, Microsoft expanded model choice through its Frontier program, making Claude available in mainline Copilot chat alongside current OpenAI models. Microsoft does not describe Claude as an automatic verification layer for GPT output.
#### Marketed Users
Microsoft markets Copilot primarily to organizations that already use Microsoft 365. The pitch is straightforward: AI that can access your existing emails, documents, calendars, and Teams chats without requiring you to upload or paste anything. It is aimed at knowledge workers, managers, and anyone whose daily work runs through Microsoft applications. Microsoft also offers GitHub Copilot separately for software developers, which is a distinct product with its own pricing and licensing.
#### Pros
- Seamless access to organizational data through Microsoft Graph. Copilot can draft an email reply referencing a document you discussed in a Teams meeting last week without you needing to find or upload anything.
- If your organization already runs on Microsoft 365, the additional cost is incremental rather than net-new, and adoption requires minimal behavior change.
- Enterprise data protections are inherited from Microsoft 365's existing compliance certifications (SOC 2, ISO 27001, HIPAA, FedRAMP).
- The Frontier program provides model choice, including access to Claude and current OpenAI models, for organizations that want to match a model to a particular workflow.
#### Cons
- Copilot requires a qualifying Microsoft 365 license before you can purchase it, which adds complexity and cost for organizations not already on M365.
- Standalone reasoning quality is weaker than ChatGPT for open-ended, multi-step tasks that are not grounded in a specific document or dataset.
- Less transparency about which model is serving any given request. Unlike ChatGPT, where you choose a specific model, Copilot routes between models automatically.
- The licensing model is more complex than any other provider on this list.
#### Privacy
The key difference between Copilot and ChatGPT is integration. Copilot can access your organization's emails, documents, calendar events, and Teams chats through Microsoft Graph, meaning it can draft responses grounded in your actual work context. ChatGPT operates as a standalone workspace and requires you to manually provide context by uploading files or pasting text.
Data entered into Microsoft 365 Copilot for business users is not used to train foundation models. It is processed within your organization's tenant and governed by Microsoft's enterprise data protection terms, inheriting the same compliance certifications as Microsoft 365 (SOC 2, ISO 27001, HIPAA with BAA, FedRAMP).
#### Costs
Microsoft 365 Copilot Chat is available at no additional cost to Microsoft Entra users with an eligible Microsoft 365 subscription. Microsoft 365 Copilot Business is $21/user/month when paid annually and requires a qualifying Microsoft 365 plan. The enterprise Microsoft 365 Copilot plan is $30/user/month when paid annually.
#### Recommended Uses
If your organization already runs on Microsoft 365, Copilot can be a natural addition for drafting and summarizing within Office apps, preparing meeting recaps from Teams transcripts, and pulling context from emails and shared documents. If you do not work primarily in the Microsoft ecosystem, ChatGPT offers a more capable standalone experience with stronger free-form reasoning, a larger feature set, and a simpler licensing model.
## Perplexity
### Sonar
Perplexity is a search-first AI platform. While other models can search the web as an add-on feature, Perplexity is built around search from the ground up. Every response includes inline citations with links to sources, making it the most transparent option for verifiable factual queries.
#### Marketed Users
Perplexity targets researchers, journalists, analysts, and anyone whose work requires finding and verifying factual information quickly. It positions itself as a replacement for (or complement to) traditional search engines rather than a general-purpose chatbot. The Pro and Max tiers are aimed at power users who need access to multiple frontier models and deep research capabilities. Enterprise tiers target organizations that need team-wide search with data governance controls.
#### Model Tiers
Perplexity's native models are called Sonar, built on Meta's open-source Llama architecture with a proprietary retrieval pipeline layered on top. On paid tiers, Perplexity also gives you access to models from other providers (such as GPT-5.x and Claude Opus) through its interface. The Max tier includes "Model Council," which sends your query to three different frontier models simultaneously and synthesizes their responses into a single answer that highlights points of agreement and disagreement.
Perplexity also offers a Deep Research mode that automates multi-step research workflows: the model formulates sub-questions, conducts multiple searches, reads the results, and produces a structured report. This process takes several minutes rather than seconds but can produce thorough, well-sourced output.
#### Pros
- Every response includes inline citations with source links by default. No other platform makes verification this easy.
- Purpose-built for search and research. For factual queries, it is faster and more reliable than using a general-purpose chatbot with web search bolted on.
- Model Council (Max tier) provides a unique multi-model synthesis that surfaces agreement and disagreement across providers, giving you a more balanced perspective on contested questions.
- Deep Research mode produces structured, well-sourced reports that can serve as a solid starting point for policy research.
- The free tier is useful for everyday factual lookups with source links.
#### Cons
- Not a general-purpose assistant. Perplexity is weaker than ChatGPT or Claude at open-ended writing, coding, document analysis, and long-form conversation. It is best used alongside one of those tools rather than as a replacement.
- Privacy practices are less transparent than larger providers. Perplexity does not publish a detailed breakdown of its training data practices comparable to OpenAI, Anthropic, or Google.
- The free tier is capped at 5 Pro Searches per day, which is limiting for sustained research sessions.
- The Max tier at $200/month is expensive relative to what other providers offer at the $20/month level, though it includes access to multiple frontier models.
#### Privacy
Perplexity's privacy practices are less thoroughly documented than the larger providers. Free-tier queries may be used to improve models. Pro and Enterprise tiers offer enhanced privacy controls. Enterprise plans include SOC 2 Type II compliance, data isolation, SSO, and custom data retention policies. Perplexity does not currently publish a detailed public breakdown of its training data practices comparable to OpenAI or Anthropic.
#### Costs
A free tier is available with limited Pro Searches (5 per day). Pro is $20/month. Max is $200/month. Enterprise tiers start at $40/seat/month.
#### Recommended Uses
Fact-checking, quick factual lookups with source verification, compiling sourced research on a topic, and any task where citation transparency is the priority. Perplexity is the strongest option when you need to show where information came from.

---
# Key Information
## Local Hosted LLM's
## Hardware Requirements and Limitations
## Prompt Engineering
## Maintaining Reliability and Institutional Integrity
## Model Context Protocol (MCP)
> [!quote] 
> The Model Context Protocol (MCP) is ==an open-source standard created by Anthropic that acts as a "USB-C port for AI."== It provides a universal, standardized way for AI models and assistants to securely connect to external data sources, internal tools, and development environments without requiring custom integrations for every platform.
> MCP uses a client-server architecture to establish secure, two-way connections between AI applications and your local files, databases, or cloud services. [[1](https://modelcontextprotocol.io/docs/learn/architecture), [2](https://www.anthropic.com/news/model-context-protocol)]
> - **The MCP Host:** The AI application you are using (like Claude Desktop, an AI-powered IDE, or an agentic framework).
> - **The MCP Client:** A component within the host that manages the connection and translates the AI’s requests.
> - **The MCP Server:** A lightweight program that sits between the AI assistant and the data source. Instead of hard-coding every endpoint, the server advertises its capabilities (what tools, prompts, and datasets are available) so the AI can dynamically discover and use them
---

# Recommendations
