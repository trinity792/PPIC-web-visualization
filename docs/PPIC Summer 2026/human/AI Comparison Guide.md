---
Topic: AI
Content Type: Explainer
pinned: true
description: Comparative guide to AI tools (Perplexity, NotebookLM, Claude, ChatGPT, Gemini, and Copilot) for research and policy workflows, with recommendations by task. Emphasizes independently verifying AI output and protecting confidential data.
Date Published: June 30, 2026
Last Updated: 07/02/2026 - 12:04 PM
Status: Finalized
---
# Introduction
## Executive Summary
AI tools can improve research and policy workflows by accelerating source discovery, document synthesis, coding, drafting, and routine analysis, but no single platform is best for every task. Perplexity is strongest for citation-based search, NotebookLM for analysis grounded in a defined set of sources, Claude for long documents and nuanced writing, and ChatGPT for flexible general-purpose work. Gemini and Microsoft Copilot are most useful when their integrations align with an organization's existing Google Workspace or Microsoft 365 environment.
These tools should support rather than replace professional judgment. Sources, quotations, statistics, analytical conclusions, and generated code must be independently reviewed, and confidential information should not be entered into a consumer account without confirming its privacy settings and terms. Business, enterprise, and API plans generally provide stronger data protections, while locally hosted models offer greater control at the cost of additional hardware and technical support.
For an initial research workflow, this guide recommends either Perplexity Pro with the free version of NotebookLM for source gathering and source-based synthesis, or a paid Claude subscription with free ChatGPT access for research, drafting, and revision. Monthly subscriptions are the simplest option for individual users, while usage-based APIs are better suited to controlled, auditable automation when an organization has the technical capacity to manage them.
Effective prompt engineering is important for reliable results. Vague prompts usually cause generic or incomplete answers, while prompts with unnecessary context can cause higher usage. An effective prompt includes a clear task description, explicit constraints, relevant source material, and one or two strong examples of the intended output. Some providers also offer prompt-improvement tools, including [OpenAI’s Prompt Optimization](https://platform.openai.com/chat/edit?models=gpt-5.4-mini&optimize=true), which can review an existing prompt and suggest a more precise version. Note that OpenAI's prompt optimizer requires a **free** developer account.
## Key Terms
### Large Language Model (LLM)
A large language model is an AI model designed to understand and generate human language. It predicts the most likely next pieces of text based on the question, instructions, and information it has been given.
### Chatbot
A chatbot is the user-facing application where someone interacts with an AI model through a conversation. ChatGPT, Claude, Gemini, and Microsoft Copilot are examples of AI chatbots.
### Model Family and Model Tier
A model family is a group of related AI models made by the same company, such as GPT, Claude, or Gemini. Different tiers within a family usually trade off speed, cost, and capability: a faster model may handle routine tasks well, while a more advanced model may be better at complex analysis or coding.
### Reasoning Model
A reasoning model is designed to spend more effort working through complex, multi-step problems before answering. It can be more accurate for tasks such as data analysis, coding, or policy research, but it is usually slower and may use more of a plan’s available capacity.
### Multimodal
Multimodal means an AI system can work with more than one type of information, such as text, images, audio, video, spreadsheets, or documents. For example, a multimodal model might analyze a chart in a PDF and explain it in writing.
### Token
A token is a small unit of text that an AI model uses to read and generate language. Tokens may be whole words, parts of words, punctuation, or symbols, and they often affect both cost and usage limits.
### Context Window
A context window is the maximum amount of information an AI model can consider at one time. It includes the current prompt, earlier messages, uploaded files, and the model’s own responses.
### Context Rot
Context rot is the gradual loss of accuracy or focus that can occur when a conversation or document set becomes too large for a model to handle well. The model may lose track of earlier details, overlook instructions, or make more mistakes.
### Web Search
Web search allows an AI tool to look for current information online instead of relying only on its built-in knowledge. Search results can still be incomplete or inaccurate, so important information should be verified using the original sources.
### API
An application programming interface, or API, is a way for software programs to send requests directly to another service. In AI, an API allows an organization’s tools or automated workflows to use an AI model without someone manually using a web chat.
### Rate Limit
A rate limit is a restriction on how many messages, searches, or tasks a person can run during a set period of time. More difficult tasks generally use more capacity than short, simple questions.
### AI Agent or Agentic Workflow
An AI agent is an AI system that can carry out a series of steps toward a goal, sometimes using tools such as web search, files, databases, or software. An agentic workflow is a process in which AI completes or assists with multiple connected tasks rather than answering one question at a time.
### Integration
An integration connects an AI tool with another system, such as email, calendars, cloud storage, databases, or workplace software. Integrations can reduce manual work, but they should be reviewed carefully because they may give the AI access to organizational information.
### Consumer Plan
A consumer plan is an individual-facing version of an AI product, such as a free or personal paid account. These plans may have different privacy terms than business plans and may allow the provider to use conversations to improve its models.
### Business or Enterprise Plan
A business or enterprise plan is designed for organizations that need shared workspaces, administrative controls, and stronger privacy protections. These plans generally do not use organizational data to train AI models by default, but the specific contract and settings should still be reviewed.
### Model Training
Model training is the process of improving an AI model by exposing it to large amounts of data. Depending on the provider and plan, conversations, uploaded documents, or feedback may be used to help improve future versions of the model.
### Data Retention
Data retention is how long a company keeps prompts, conversations, uploaded files, or other information. Retention rules differ across providers, account types, and features such as temporary or private chats.
### Locally Hosted LLM
A locally hosted LLM is an AI model that runs on an organization’s own computer or server rather than on a provider’s remote system. This can provide more control over sensitive data, but it requires suitable hardware, technical support, and maintenance.
### Llama architecture
Llama architecture is the technical design behind Meta's Llama family of AI models, which other organizations can use as a foundation for their own AI tools.
### CPU, RAM, and GPU
A CPU is the computer’s general-purpose processor, RAM is its short-term working memory, and a GPU is a processor built to handle many calculations at once. Local AI models often need substantial RAM and GPU capacity to run quickly and reliably.
### Model Context Protocol (MCP)
The Model Context Protocol, or MCP, is a shared technical standard that helps AI applications connect to approved tools, files, databases, and services. It can reduce the need to build a custom connection for every AI tool, but access permissions still need to be managed carefully.

## Billing Types
### Monthly Subscription
Most AI companies offer a monthly or annual subscription plan. What's included varies by company and tier. For example, ChatGPT Plus and Claude Pro subscriptions include access to the web-based chat interface, the ability to connect to external tools, and the ability to build and implement agentic workflows. Specific features and limits for each plan are described later in this document under each company's section.
The main drawback of subscriptions is rate limiting. Each company sets a cap on how many messages you can send within a given time window before you're required to wait. These limits are often unspecified because they can change dynamically, based on prompt complexity, conversation length, and tool use. To illustrate: you could ask a model 100 simple single-sentence questions without coming close to the limit. However, asking a model to review the past 75 years of economic trends, evaluate their effects on societies around the world, and then write a comprehensive 10,000-word report on those findings would likely hit or approach the limit in a single prompt. This is because more complex prompts require greater reasoning effort and a greater ability to maintain a chain of thought and context.
### By Usage
Per-usage billing charges you for the "tokens" you consume rather than a flat monthly fee. Users typically interact with models through a terminal or within an interactive development environment (known as an IDE, where programmers write and test their code) rather than a web chat interface. This billing model is most common in "agentic" workflows, where different models interact with each other and perform tasks autonomously.
Per-usage billing can be cheaper than a subscription if you use a lower-tier model and keep prompts simple. However, for more complex tasks, a higher-tier model is necessary. Per-usage billing is most commonly used by programmers building agentic workflows and then letting the models execute specified tasks. In return, it offers more control over model behavior and slightly more explainability in how outputs are generated.

> [!tip] Benefits of using an API
> Writing a program to interact with a model allows more control. For example, if you have an AI model research and write a report, you would write a program that includes prompts for each part of the process, limitations, and a function that logs every site the AI visited and what information it pulled from that site. This makes the process easier to audit.
 However, the tradeoff is a steeper learning curve and the costs that result from not placing limits on token use.

---
## Use Cases
### Search Engine & Source Gathering
Using AI as an alternative or supplement to traditional search engines for finding information, answering factual questions, and collecting sources for research.
#### What this looks like in practice:
Unlike a traditional search engine that returns a list of links, AI models can interpret a complex question, search the web, and return a synthesized answer with cited sources. You can ask follow-up questions to refine the results without starting a new search. This also extends to systematic source collection where you ask a model to find government reports, academic papers, or datasets on a specific topic and return them organized by relevance, date, or methodology.
#### Where it works well:
- Finding and compiling government data sources, legislative text, or agency reports across multiple jurisdictions.
- Translating explanations of complex concepts or systems from technical terms into plain language and vice versa.
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
- **Models are poor program architects.** You must know how to structure programs, outline data contracts, style guides, and user flows. Models struggle to structure an entire multi-purpose codebase project without blueprints. 
> [!IMPORTANT] 
> If you are building a house, you are the architect, designer, and inspector while the model is the construction team.
#### Models with strong coding capabilities:
Claude (Sonnet and Opus), ChatGPT (GPT-5.5)
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
- **Context window limits are real.** Every model has a maximum amount of text it can "hold in memory" at once. If you upload more text than the model can process, it will either refuse, silently truncate, or lose track of earlier material (aka "Context Rot"). This is especially relevant when working with multiple long reports simultaneously. 
- **Nuance gets flattened.** Models tend to produce clean, confident summaries even when the underlying sources are ambiguous, contested, or heavily caveated. The synthesis may read as more definitive than the evidence warrants. Effective prompting can mitigate these effects.
- **Verification is non-negotiable.** Any specific claim, statistic, or quote in a model-generated synthesis should be verified against the original source. Models can misattribute findings, combine numbers from different contexts, or subtly reframe an author's argument.
#### Models/tools with strong synthesis capabilities:
Claude (large context window, strong document analysis), ChatGPT Deep Research, Gemini Deep Research, Google NotebookLM (designed specifically for working with uploaded sources)
### Everything Else
The categories above cover the use cases most immediately relevant to research and policy work, but AI models are general-purpose tools. Other common applications include drafting and editing written content, translating between languages, summarizing meetings or long email threads, and brainstorming approaches to a problem. These uses are typically workflow-dependent and most people discover them organically as they use the tools more.

---
# Companies and Their Models
This section covers the major AI providers, their model lineups, and how they handle your data. Pricing and model names change frequently, so treat specific figures as approximate. This section was last updated on June 29, 2026.
A note on privacy that applies across all providers: the consumer/enterprise divide is important, but consumer defaults are not uniform. Google may use future Gemini chats to improve its services when Keep Activity is on, and OpenAI uses consumer ChatGPT conversations for training by default unless the user opts out. Anthropic generally uses consumer Claude conversations for model improvement only if the user chooses to allow it, with separate exceptions for submitted feedback and conversations flagged for safety review. Business, enterprise, and API offerings generally exclude customer data from model training by default, but organizations should confirm the terms for the specific product and plan they use.
## Google
### Gemini
Gemini is Google's flagship multimodal AI model family and the primary competitor to ChatGPT and Claude. It powers the Gemini chatbot and AI features across Google Workspace and is marketed to consumers, students, educators, businesses, enterprises, and developers. Gemini is especially well suited to existing Google users because it can process text, images, audio, and video while integrating directly with tools such as Gmail, Drive, Docs, and Calendar.
#### Model Tiers
- **Gemini 3.5 Flash** is the fast model available across the free and paid Gemini app plans. It's strongest at simple prompts or repetitive tasks with low token usage, but will underperform for complex tasks.
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
When Keep Activity is on, Google may use consumer Gemini chats to improve its services and models, and human reviewers may read some conversations. Turning it off prevents future chats from being used for training unless feedback is submitted, but Google retains them for 72 hours and disables some Connected Apps; Temporary Chats are also retained for 72 hours without being used for training. Google does not use Workspace or Cloud customer data to train its foundation models and provides enterprise compliance protections.
#### Costs
A free tier is available with limited features. In the United States, Google AI Plus is \$4.99/month, Google AI Pro is \$19.99/month, and Google AI Ultra starts at \$99.99/month for 5x the Pro usage limits or \$199.99/month for 20x the Pro limits. Prices and included benefits vary by country.
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
These are creative tools rather than research or productivity assistants and are unlikely to be central to most policy work.
## OpenAI
### ChatGPT (GPT Models)
ChatGPT is OpenAI's consumer-facing AI product, powered by the GPT model family, and as of mid-2026 has over 400 million weekly active users. OpenAI markets it broadly to casual users, students, writers, researchers, engineers, and business professionals. Paid individual plans serve power users, while Business, Enterprise, Edu, API, and Codex offerings target organizations, educators, and developers with more specialized needs.
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
OpenAI uses conversations from free and individual paid plans for training by default, but users can opt out under Data Controls or use Temporary Chat. Business, Enterprise, and API data is excluded from training by default, with additional security and administrative controls available to organizations. API logs are generally retained for about 30 days for abuse monitoring.
#### Costs
A free tier is available with limited access to ChatGPT's current models. Paid individual plans start at \$20/month (Plus) and go up to \$200/month (Pro). ChatGPT Business is \$20/user/month when billed annually or \$25/user/month when billed monthly. Enterprise pricing is custom.
#### Recommended Uses
General-purpose assistant for writing, research, brainstorming, and coding. GPT-5.5 Thinking and Pro are particularly strong for tasks requiring extended reasoning. ChatGPT's broad feature set (memory, custom GPTs, plugins) makes it the most flexible standalone AI workspace.
## Anthropic
### Claude
Claude is Anthropic's safety-focused AI model family, designed with an emphasis on being helpful, harmless, and honest. Anthropic markets Claude to professionals who prioritize careful, nuanced output, particularly researchers, knowledge workers, software developers, and enterprises in regulated industries. Its strengths in long-document analysis, coding, and nuanced reasoning shape that focus, while Claude for Education and Claude Gov extend the platform to academic and government users.
#### Model Tiers
- **Fable / Mythos** is the most capable tier, launched in June 2026. Fable is the publicly available version with safety classifiers that automatically fall back to Opus on certain sensitive topics (cybersecurity, biology/chemistry). Mythos is the same underlying model with those safety classifiers removed and is available only to vetted cybersecurity and research organizations through Anthropic's trusted access program (Project Glasswing). Fable sets the current state of the art on most major AI benchmarks. As of mid-June 2026, access to both Fable and Mythos has been suspended under a US government export control directive.
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
- While the setting is optional, allowing Anthropic to use consumer chats for model improvement extends retention of that data to five years, is less than ideal.
- Fable/Mythos availability was recently suspended due to federal export restrictions. However, as of July 1st they've redeployed. Currently, the long term availability of these models are uncertain. Read more about it [here](https://www.anthropic.com/news/redeploying-fable-5).
- Fable model is highly restrictive and refuses to answer many questions in relation to biology, chemistry, medicine, or psychology. Good for guardrails, bad for someone trying to write a report.
- The free tier is more limited than ChatGPT's, with lower message caps and fewer features.
- The Opus model uses ~2x as many tokens as Sonnet.
#### Privacy
Anthropic uses consumer chats and coding sessions for model improvement only when users opt in, although submitted feedback and safety-flagged conversations may be handled separately; improvement data may be retained for five years. Incognito conversations are not used for training. Team, Enterprise, and API data is excluded from training by default, with enterprise privacy options and standard seven-day API log retention.
#### Costs
A free tier is available. Paid plans start at \$20/month (Pro) and go up to \$100/month (Max). Team plans are approximately \$25-30/user/month. Enterprise pricing is custom.
#### Recommended Uses
Long-document analysis and synthesis, coding (particularly strong with Opus), nuanced policy writing, and tasks requiring careful attention to context over extended conversations. Claude's large context window (up to 200K tokens on paid plans) makes it especially well-suited for uploading and analyzing multiple lengthy documents at once.
## Microsoft
### Copilot
Microsoft Copilot is a suite of AI-powered tools embedded directly into Microsoft 365 applications rather than a standalone AI model. It is marketed primarily to organizations, knowledge workers, and managers whose daily work runs through Microsoft 365, with access to organizational emails, documents, calendars, and Teams chats as its central appeal. Copilot Wave 3 adds Claude alongside current OpenAI models through Microsoft's Frontier program, while the separate GitHub Copilot product targets software developers.
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
Microsoft 365 Copilot can access organizational emails, documents, calendars, and Teams chats through Microsoft Graph. Business customer data is processed within the organization's tenant, is not used to train foundation models, and is covered by Microsoft 365's enterprise data protections and compliance certifications.
#### Costs
Microsoft 365 Copilot Chat is available at no additional cost to Microsoft Entra users with an eligible Microsoft 365 subscription. Microsoft 365 Copilot Business is \$21/user/month when paid annually and requires a qualifying Microsoft 365 plan. The enterprise Microsoft 365 Copilot plan is \$30/user/month when paid annually.
#### Recommended Uses
If your organization already runs on Microsoft 365, Copilot can be a natural addition for drafting and summarizing within Office apps, preparing meeting recaps from Teams transcripts, and pulling context from emails and shared documents. If you do not work primarily in the Microsoft ecosystem, ChatGPT offers a more capable standalone experience with stronger free-form reasoning, a larger feature set, and a simpler licensing model.
## Perplexity
### Sonar
Perplexity is a search-first AI platform built around finding and verifying factual information, with inline citations and source links included in every response. It is marketed to researchers, journalists, analysts, and others who need verifiable information quickly. Pro and Max plans target power users seeking advanced models and deep research, while Enterprise plans serve organizations that need shared search tools and data governance.
#### Model Tiers
Perplexity's native models are called Sonar. They are built on the foundation of Meta's open-source Llama architecture, with a proprietary process for searching the web layered on top. On paid tiers, Perplexity also gives you access to models from other providers (such as GPT-5.x and Claude Opus) through its interface. The Max tier includes "Model Council," which sends your query to three different frontier models simultaneously and synthesizes their responses into a single answer that highlights points of agreement and disagreement.
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
- The Max tier at \$200/month is expensive relative to what other providers offer at the \$20/month level, though it includes access to multiple frontier models.
#### Privacy
Perplexity may use free-tier queries to improve its models, while paid plans provide stronger privacy controls. Enterprise plans add SOC 2 Type II compliance, data isolation, SSO, and custom retention policies, although Perplexity publishes less detail about its training practices than some larger providers.
#### Costs
A free tier is available with limited Pro Searches (5 per day). Pro is \$20/month. Max is \$200/month. Enterprise tiers start at \$40/seat/month.
#### Recommended Uses
Fact-checking, quick factual lookups with source verification, compiling sourced research on a topic, and any task where citation transparency is the priority. Perplexity is the strongest option when you need to show where information came from.

---
# Additional Information
## Prompt Engineering
A highly generalized template for prompting most models:
```
CHARACTER
Act as an expert [Role/Profession, e.g., Senior Financial Analyst]. 

CONTEXT
I am trying to [Goal/Objective, e.g., analyze Q2 SaaS metrics] for [Audience/Purpose, e.g., the executive board]. The background data is as follows: [Paste data, documents, or background info here].

CONSTRAINTS
- Tone: [e.g., Professional, data-driven, and concise]
- Length: [e.g., Under 500 words]
- Output Format: [e.g., A Markdown table followed by 3 executive bullet points]
- Exclusions: [e.g., Do not use jargon or passive voice]
- Examples: 
[Input 1] -> [Output 1 format]
[Input 2] -> [Output 2 format]

COMMAND
[Specific Action Verb] the provided data to [Final Deliverable, e.g., create an executive summary highlighting the top 3 growth opportunities and 1 potential risk].

```
## Large Language Models
A large language model is an AI system trained on large amounts of text to recognize patterns learned from words and phrases. When you type a prompt, the model breaks your text into tokens to identify patterns and determine the most probabilistic string of words and phrases to produce an output. The large increases in model performance have been influenced by advances in hardware and improved training techniques.
## Locally Hosted LLMs
Locally hosted LLMs are AI text models that run on your own laptop, desktop, or internal server instead of on an AI company's remote system. That means the questions you type and the answers you get stay on your device, and many local setups will still work offline after the model has been downloaded.
When you use a locally hosted LLM, it functions identically to any other LLM: the software loads the model into memory, turns your prompt into tokens, performs its tasks, and generates a response. The core difference is that everything is done on your device, which means the only way for someone or another company to access your prompt history, file uploads, or model memory is to physically access your laptop. This type of setup may be beneficial for PPIC since it maintains privacy and security. The model would be hosted on PPIC servers and would be accessed the same way you already access something like the R: drive. Local models offer better privacy, control, and no cost per message, but their speed and quality depend a lot on the hardware or the components of the server.
### Hardware Requirements and Limitations
As a refresher, the core components of a computer include the CPU, which is essentially the conductor: it ensures every other component is doing its job and manages what happens when they don't. RAM is the short-term memory. Its size is relatively small compared to the main storage, but things stored in short-term memory are easy to access and load. As an example, if you frequently switch between multiple apps, information about how you left the last app is stored in RAM. If it were stored in the main storage instead, app switching would become very slow. When you buy a laptop, you typically see capacity measured in gigabytes (GB) or terabytes (TB). RAM size is typically 8-128GB, while main storage is typically 256GB-2TB+. The last important part of the computer is the GPU, which is the muscle. The GPU handles image processing and other demanding visual tasks such as video or photo editing, graphic design, etc. 
The performance or quality of outputs from local LLMs depends heavily on the RAM and GPU. The RAM capacity dictates the "size" of the model. Smaller models literally use less RAM, but this is the same as having a smaller short-term memory. Smaller models are good at simple or repetitive single-step tasks but struggle with following multistep instructions. Recall how an LLM turns your prompt into tokens to determine the most plausible string of words and phrases. This is a mathematically intense task that requires a strong GPU. The way a GPU handles demanding visual tasks is by performing many computations. The better the GPU, the more accurate the computations are and the more computations it can perform. 
In terms of LLM performance, the GPU and RAM are intrinsically linked. A large model on a computer with a great GPU but only 16GB of RAM will literally fail to load, and if you force it, your entire system will crash. A large model on a computer with a decent GPU and 64GB of RAM is a better option; however, the task will take exponentially longer than it would with a cloud-based model.
## Model Context Protocol (MCP)
> [!quote] 
> The Model Context Protocol (MCP) is an open-source standard created by Anthropic that acts as a "USB-C port for AI." It provides a universal, standardized way for AI models and assistants to securely connect to external data sources, internal tools, and development environments without requiring custom integrations for every platform.
> MCP uses a client-server architecture to establish secure, two-way connections between AI applications and your local files, databases, or cloud services. [[1](https://modelcontextprotocol.io/docs/learn/architecture), [2](https://www.anthropic.com/news/model-context-protocol)]
> - **The MCP Host:** The AI application you are using (like Claude Desktop, an AI-powered IDE, or an agentic framework).
> - **The MCP Client:** A component within the host that manages the connection and translates the AI’s requests.
> - **The MCP Server:** A lightweight program that sits between the AI assistant and the data source. Instead of hard-coding every endpoint, the server advertises its capabilities (what tools, prompts, and datasets are available) so the AI can dynamically discover and use them.
---

# Recommendations
### Option 1:
Begin with a Perplexity Pro subscription + the free version of NotebookLM. Perplexity Pro works very well for research gathering, and its deep research mode is truly effective. Use NotebookLM for even more in-depth explanations and different ways of presenting information. NotebookLM can generate audio overviews, videos, reports, slide decks, and infographics based on the information you give it. Only upgrade to a paid plan (Google's AI plan) if you begin hitting source size or count limitations.
### Option 2:
Begin with a Claude subscription + free ChatGPT access. You can't go wrong with either, but combining them is effective. Paying for Claude is more effective since its free tier is quite limiting. An example workflow would be using ChatGPT to gather sources and provide high-level summaries, then using Claude to outline, draft, and revise a report. Compared with Perplexity's free plan, ChatGPT's free plan is better. Claude Opus's long context window means it can maintain high-quality outputs through each step of your workflow. Only upgrade to a paid ChatGPT plan if you need a mix of general-purpose AI, better web search, and the use of external tools.
### Option 3:
A Claude subscription along with a budget for extra usage is an effective combination for long form research, writing complex texts, and developing software. Claude Cowork and Code are especially helpful when working with Opus that can analyze large codebases, track logic between files, propose refactoring, create tests, and explain codebases. It is also helpful at creating long reports, comparing sources, and organizing notes into a research outline or memo. The ideal combination here would be having Perplexity Pro for sourcing of current sources, and either NotebookLM or Claude Opus for synthesizing the information and Claude Code for more extensive programming. The main drawback is the usage limit – it can easily be reached during long Opus sessions, uploading big documents, and doing coding on the repository level.

---
*Written by Trinity Jones and used GPT 5.5 for grammatical fixes*