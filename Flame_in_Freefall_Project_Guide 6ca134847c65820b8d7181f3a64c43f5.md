# Flame_in_Freefall_Project_Guide

# Flame in Freefall

Make sure to doccument your progress and thought on this project in a .md file

links:  

atom.g NASA microgravity fire simulation  

[https://atom.g-space.com](https://atom.g-space.com/)

NASA PSI doccuments

[https://psi.nasa.gov/physci/repo/search?q=&data_source=psi&data_type=investigation](https://psi.nasa.gov/physci/repo/search?q=&data_source=psi&data_type=investigation)

NASA Open Science Data Repository

[https://osdr.nasa.gov](https://osdr.nasa.gov/?utm_source=chatgpt.com)

NASA Glenn Research Center

[https://www1.grc.nasa.gov/](https://www1.grc.nasa.gov/?utm_source=chatgpt.com)

NASA Technical Reports Server (NTRS)

[https://ntrs.nasa.gov/](https://ntrs.nasa.gov/?utm_source=chatgpt.com)

## Project Development Guide

## 1. The project in simple words

NASA has run many experiments to understand how fire behaves in space.
Fire behaves differently in microgravity because hot gases do not rise
in the usual way. Oxygen levels, airflow, materials, and pressure can
also change how a fire starts, spreads, is detected, or is extinguished.

NASA has made information from many of these experiments available
through its Physical Science Informatics (PSI) database. However, the
information can be difficult to find, compare, and understand.

**Flame in Freefall** is a website that makes this research easier to
use. It helps people:

- Find NASA combustion experiments.
- Understand what each experiment studied.
- Ask questions about the research.
- Compare experiments.
- View available measurements in charts.
- Explore what the research may mean for spacecraft, the Moon, and
Mars.
- Find questions that still need more research.

The main idea is:

**NASA research → organized information → AI-supported understanding →
useful fire-safety insights.**

This is a research tool. It is not a certified spacecraft safety system,
and its predictions must not be treated as guaranteed real-world
outcomes.

---

## 2. Who will use the website?

The main users are:

- Your target audience includes professors, graduate students, undergraduate students, aerospace researchers, and aerospace engineers.
- Students learning about space combustion.
- Researchers studying fire in microgravity.
- Aerospace engineers.
- People interested in spacecraft and habitat safety.

The website should use clear language. Users should not need to read a
full research paper just to understand what an experiment was about.

Notice the website will be very huge, so I need u to add a guide all over the website, or like a plan at first, where to go and how to use it, not at the beginning of each feature. Like a guide to help you start if you do not have any idea. Also, in each feature, add, like, an AI inline chat for anything not understood to get it 

---

## 3. The eight main features

The website has eight main sections. They share the same NASA research
data, so information added once can be used in different parts of the
website.

### Feature 1 — Research Explorer

**What it means**

A place where users can find and read about NASA combustion experiments.

**What users can do**

- The primary filter on top shows relevant experiments based on the type of habitable environment and an ai summary summarizes the safety needs of that environment summarizing the main safety insights and Review research gaps and limitations.
- Search for an experiment by name or topic.
- Some side buttons filter experiments by fuel or material, research area, gravity
condition, oxygen level, or other available conditions. And if there is no data for these filters, offer an AI prediction of what would happen with these conditions. The message could be like: No experiment found, but based on your data…
- Open an experiment to see its details.
- Find links to its original NASA page, paper, or dataset.

 **build it by c**ollecting information about relevant PSI
investigations.

### Feature 2 — AI Research Assistant

**What it means**

A chat assistant that answers questions using the NASA research
collected for this project.

**What users can do**

- Your target audience must include professors, graduate students, undergraduate students, aerospace researchers, and aerospace engineers.
- Ask questions in normal language.
- Get simple summaries of experiments.
- Ask for explanations of scientific terms.
- Ask which experiments are relevant to a topic or mission.
- Ask the assistant to compare or find related experiments.
- Open the sources used in an answer.
- Add a button to download a full report from the chat that downloads a full summary in PDF

**Related idea: Finding related experiments**

When a user opens an experiment, the assistant can suggest other
experiments that study similar materials, conditions, or questions.

**Important rule:** The assistant should say when the collected research
does not contain enough information. It must not invent experiment
results or citations.

**Example**

User: “Which NASA experiments studied smoke detection in space?”

Assistant: Finds relevant SAME and SAME-R research, summarizes their
purpose, and links to the supporting sources.

it’s more than a normal chatbot and try not to make it a simple chatbot also will needed to add intext citations and refer to the experiment profile that in feature one

### Feature 3 — Experiment Ranking

**What it means**

A way to show which experiments are most relevant to a selected space
environment or fire-safety question.

**What users can do**

- choose from the same filters as in the research explorer feature
- See a ranked list of relevant investigations based on factors you can choose from from the data such as flammability or gravity
acceleration, oxygen level, or other available conditions.

**How we will build it**

1. Decide which experiment details matter for each environment.
2. Give each detail a score using information actually available in the
database.
3. Combine the scores into a relevance score.
4. Sort the experiments from most relevant to least relevant.
5. Explain which factors affected each score.

Possible factors include material type, oxygen conditions, gravity
conditions, research goal, and available measurements.

The weights are our own project choices, not official NASA scores. The
page must explain how the score is calculated.

also add an option for the use of custom ranking criteria where the user types in a criteria of their choice and using ai, it ranks the experiments based on this custom criteria and if the prompt is completely irrelevant to the data then give an error

### Feature 4 — Experiment Comparison

**What it means**

A page where users can compare two or more NASA experiments side by
side.

**What users can do**

- Select experiments to compare.
- Compare their goals, materials, fuels, pressure, oxygen level,
airflow, gravity conditions, hardware, sensors, and measurements
when available.
- See what is similar and what is different.
- Notice when information is missing.

**How we will build it**

1. Use the structured experiment information already saved in the
database.
2. Let the user select two or more investigations.
3. Display their details in a comparison table.
4. Highlight matching and different values.
5. Mark unavailable information as “Not reported” instead of guessing.

**Example**

A user compares two experiments that studied solid materials. The page
shows which conditions were shared and which were different, such as
oxygen concentration or airflow.

### Feature 5 — Fire Safety Insights

**What it means**

A section that explains what NASA’s research can teach us about
preventing, detecting, and extinguishing fires in space.

This section turns research findings into clear explanations. It should
always show which experiments or sources support each point.

#### A. Fire Prevention

**Meaning:** Understanding how to reduce the chance of a fire starting
or spreading.

**What it includes**

- What research says about material flammability.
- How oxygen concentration can affect burning.
- How airflow and pressure may affect combustion.
- Which experiments can help with choosing safer materials.

**How we will build it**

Collect findings from relevant experiments, group them under prevention,
and show short explanations with source links.

#### B. Fire Detection

**Meaning:** Understanding how a fire or smoke can be noticed early.

**What it includes**

- Research about smoke and aerosol behavior.
- Experiments that studied smoke detection.
- Sensors and measurement methods used.
- Known limits of the available research.

**How we will build it**

Use information from investigations such as SAME and SAME-R. Summarize
what they studied and show the available measurements and original
sources.

Note:

- Show the tested conditions and limitations beside each result so users do not assume a sensor was validated for every spacecraft environment.

#### C. Fire Suppression

**Meaning:** Understanding how a fire can be put out.

**What it includes**

- Research on fire suppression methods.
- Studies involving carbon dioxide and helium.
- Conditions under which flames were extinguished.
- What the research may mean for future spacecraft equipment.
- Highlight research about the development of next-gen fire safety controls and equipment

**How we will build it**

- Extract the tested suppression agent, concentration, fuel/material, pressure, oxygen level, and extinction result when reported.

#### D.  Research Gaps

A section that shows what NASA has studied and what information is still
missing or limited.

**What users can do**

- See which materials or conditions have been studied.
- Find areas with little available data.
- Explore the lack of partial-gravity combustion data in the current
PSI collection described by the challenge.
- See possible questions for future experiments.
- Understand where Earth and microgravity results cannot be directly
compared.

**How we will build it**

1. Review the experiments included in our database.
2. Group them by material, gravity condition, oxygen level, airflow,
and research topic.
3. Count which groups have data and which have little or no data.
4. Show the gaps in simple charts or lists.
5. Explain that a gap in our collected data does not prove that no
research exists anywhere.
- Add a label such as “Not represented in this project collection” when the selected records have no matching data.
- Keep the selected dataset and filters visible so users understand what the gap statement is based on.

### Feature 6 — Charts, Predictions & What-If Tests

**What it means**

One section that lets users explore real experiment measurements, see
patterns, and try simple predictions when the data supports them.

#### A. Scientific charts

**What users can do**

- View charts made from NASA experimental measurements.
- Select an experiment or measurement.
- Compare available experimental runs.
- View values, units, and test conditions.
- Download a chart or data file if time allows.

**How we will build it**

1. Find experiments that provide numerical data.
2. Read and clean the available data using Python and Pandas.
3. Keep the experiment name, units, and test conditions connected to
every measurement.
4. Use Plotly to create interactive charts.
5. Add filters only for variables that actually exist in the selected
dataset.

Possible charts include temperature over time, flame size over time, or
measured flame behavior under different test conditions. These are
examples; we will only show a chart if the source dataset contains the
required measurements.

#### B. Predictive model

**Meaning:** A machine-learning model that estimates an outcome using
patterns in experimental data.

**How we will build it**

1. Choose one prediction question that the available data can support.
2. Prepare a dataset with clear input variables and a target value.
3. Train a simple model using Scikit-learn.
4. Test it on data that was not used for training.
5. Show its performance and limitations.
- Split data by experiment/run where possible so measurements from the same run do not leak into both training and testing.
- If there are too few independent experiments, do not train a model. Show charts and evidence instead.

Do not force a prediction model if there is not enough suitable data. A
reliable chart and clear explanation are better than an unsupported
prediction.

#### C. What-If tests

**Meaning:** Letting users change conditions and explore what the
available evidence or model suggests might happen.

**What users can change**

- Oxygen concentration.
- Pressure.
- Airflow.
- Material or fuel, if the model supports it.

**How we will build it**

1. Add simple input controls.
2. Check whether the selected conditions are within the model’s
supported data range.
3. If they are, run the model and show the estimate.
4. Show uncertainty and the closest supporting experiments.
5. If they are outside the supported range, explain the limitation and
show related research instead of pretending the prediction is
reliable.

**Technical side**

- Build a React form with numeric inputs or sliders for supported variables.
- Send the selected values to a FastAPI prediction endpoint.
- Validate ranges on the backend using the minimum and maximum values in the training data.
- Return the estimate, model version, supported range, and uncertainty information where available.
- If a value is outside the range, block the prediction and return a clear explanation plus links to related experiments.

**Example**

A user changes oxygen concentration from 21% to 30%. The website shows
relevant experiments and, only if a suitable model exists, an estimated
result. It clearly labels the result as a model prediction, not a
directly measured NASA result.

---

## 4. How the features connect

The eight features should not be eight separate systems. They should use
the same collected research.

For example:

1. The **Research Explorer** stores and displays a BASS-II
investigation.
2. The **AI Research Assistant** answers questions about BASS-II and
finds related studies.
3. **Experiment Ranking** checks how relevant BASS-II is to a Moon
Base.
4. **Experiment Comparison** compares it with another investigation.
5. **Fire Safety Insights** explains what the findings mean for
material safety.
6. **Research Gaps** identifies conditions that have not been studied
enough.
7. **Charts, Predictions & What-If Tests** visualizes available
measurements and explores supported scenarios.

The AI assistant should also be accessible from other pages. For
example, users should be able to ask about a chart or an experiment
without leaving that page.

---

# 5. Development roadmap

The goal is to build and test as much as possible before the hackathon.
Use the hackathon itself to finish missing parts, connect everything, fix
problems, and prepare the final demo. Build a small working version of
each important feature before adding advanced extras.

## Phase 1 — Understand the NASA data and plan the project

**Goal:** Know what information is available before building the features.

### Tasks

- Explore NASA PSI and its investigation records.
- Check how to access papers, reports, and numerical datasets.
- Select around 5–8 investigations with useful, accessible information.
- Identify which investigations contain numerical data suitable for charts.
- Create the GitHub repository and agree on the project structure.
- Define one shared data format for every investigation.
- Decide which features can be built from the data that actually exists.

**Finish this phase with:** A selected set of NASA investigations, a sample of cleaned data, and a clear technical plan.

## Phase 2 — Build the data foundation

**Goal:** Organize the research once so every feature can use it.

### Tasks

- Collect investigation names, objectives, materials, conditions, findings, and source links.
- Process available CSV or other numerical files with Python and Pandas.
- Store structured investigation records in the database.
- Store document text and metadata for AI search.
- Keep units, source links, and experiment IDs attached to the data.
- Create backend API endpoints to retrieve investigations and measurements.
- Check missing values and use “Not reported” instead of guessing.

**Finish this phase with:** A database, a small reliable research collection, and working APIs.

## Phase 3 — Build the core website

**Goal:** Make the research easy to find, understand, and compare.

### Tasks

- Build the Research Explorer search, filters, and investigation detail pages.
- Build the Experiment Comparison table using the shared database.
- Build the Experiment Ranking logic and show why each result is relevant.
- Create a consistent layout and navigation for all sections.
- Connect the frontend to the backend APIs.

**Finish this phase with:** Users can search, open, rank, and compare the selected NASA investigations.

## Phase 4 — Add the AI assistant

**Goal:** Let users ask questions and get answers grounded in NASA sources.

### Tasks

- Extract text from selected NASA papers and reports.
- Split documents into chunks and generate embeddings.
- Store embeddings with document and experiment metadata.
- Retrieve relevant chunks for each user question.
- Send retrieved context to an LLM and request an answer with citations.
- Add related-experiment suggestions using shared metadata and/or embedding similarity.
- Test questions where the answer is missing and make the assistant say so.

**Finish this phase with:** A working RAG assistant that answers from the selected research and links to sources.

## Phase 5 — Add scientific analysis and safety insights

**Goal:** Turn the collected research into clear, evidence-based insights.

### Tasks

- Organize findings into prevention, detection, and suppression.
- Add the Earth vs. microgravity explanation with cited sources.
- Build Research Gaps from the conditions represented in the database.
- Clean numerical datasets and create interactive Plotly charts.
- If the data is suitable, train and evaluate one simple Scikit-learn model.
- Add What-If controls only for variables supported by that model.
- Clearly separate measured values from model predictions.
- potential fire applications of psi data to fire safety on earth

**Finish this phase with:** Sourced safety insights, a useful research-gap view, and at least one chart based on real NASA measurements. A prediction model is optional and depends on data quality.

## Phase 7 — Hackathon integration and final polish

**Goal:** Use the hackathon to improve the working project, not start everything from zero.

### Tasks

- Connect and test all features using the same data and APIs.
- Fix broken links, API errors, missing data, and confusing UI behavior.
- Test AI answers and verify citations manually.
- Check chart units, labels, and data sources.
- Test What-If limits and make unsupported scenarios fail safely.
- Deploy the website and check it on another device.
- Prepare the architecture diagram, demo story, and presentation.

**Finish this phase with:** A stable deployed project and a clear demo of the complete research workflow.

---

## 7. Recommended tools

pick what you think is the best for this application

---

## 8. What to finish first

We will test this website on 3 stages:

### On the first stage we will test

1. Research Explorer with real NASA information.
2. AI Research Assistant with source links.
3. Experiment Comparison.
4. Investigation Ranking.
5. Fire Safety Insights.
6. At least one chart using real experimental data.

### After testing the first stage build this so we can test it

1. Research Gaps.
2. Mission Report.
3. One simple predictive model and What-If test.

### Do not prioritize these until the core features work

- A full 3D spacecraft simulator.
- A realistic physics-based fire simulator.
- A complicated deep-learning model.
- Processing every NASA PSI investigation.
- An autonomous AI agent that performs many uncontrolled steps.
- A complicated knowledge graph.

A simple, working version is the goal.

---

## 9. Final demo idea

Use one story to demonstrate the platform.

**Scenario: Researching fire safety for a Moon Base**

1. Select “Moon Base” as the mission environment.
2. Search for experiments related to solid material flammability.
3. Open BASS-II and read its research objective.
4. Ask the AI assistant which other experiments are related.
5. Compare two investigations.
6. Open Fire Safety Insights and explain why oxygen concentration and
material choice matter.
7. Show the Earth vs. microgravity explanation.
8. Open a chart made from actual NASA measurements.
9. Try a supported What-If scenario, or explain why the available data
is not enough for a reliable prediction.
10. Generate a mission report with references.

This demo shows the complete purpose of the project without needing to
show every small feature.

---

## 10. Final checklist

Before submitting, check that:

- [ ]  The website opens and works.
- [ ]  The research comes from real NASA sources.
- [ ]  Investigation details have source links.
- [ ]  Search and filters work.
- [ ]  The AI assistant uses the collected research.
- [ ]  AI answers show their sources.
- [ ]  Related experiments can be discovered.
- [ ]  Experiments can be compared.
- [ ]  Ranking scores have clear explanations.
- [ ]  Safety insights cover prevention, detection, and suppression.
- [ ]  The Fire Safety Insights section includes a plain-language
example.
- [ ]  Research gaps are based on the collected evidence.
- [ ]  Charts use real measurements and correct units.
- [ ]  Predictions are clearly labeled and tested, if included.
- [ ]  The mission report includes references.
- [ ]  The deployed website and submission links work.

---

## The one thing to remember

You do not need to build a perfect scientific platform before the hackathon.

Build a small platform that does one thing really well: **help people
find NASA combustion research, understand it, and see how it can inform
fire safety in space.**

Start with the data. Build the simplest working version. Add
intelligence and visualizations after the research is organized.

**Do not let the number of features distract you from the main goal.**

This is the text of the challenge on the NASA website prioritize anything in it over any else 

For decades, NASA has studied how flames and fire behave in microgravity, gathering a trove of experimental data along the way. That knowledge matters more than ever as humans gear up to return to the Moon and press on to Mars, yet the volume of results makes them hard to find, compare, and understand. Your challenge is to create an interactive, super intelligence (SI) powered dashboard that summarizes, ranks, and interprets those findings to deliver fire safety insights for human space exploration.

## **Background**

Fire hazards are extremely dangerous in space exploration! In describing a smoke alarm that went off during the recent Artemis II mission, the commander commented, “[If] you want to get somebody’s attention really quick, make the fire alarm go off in your spacecraft when you’re still about 80,000 miles from home.” Decades earlier, the Apollo 13 crew endured the life-threatening results of an oxygen tank explosion on their way to the Moon. Similarly, a multinational crew survived a fire aboard the Mir space station caused by an oxygen generator failure. In 1967, the Apollo 1 crew died in a pre-launch test when fire erupted in their oxygen-filled spacecraft.

Compared to Earth, flames in free fall (i.e., in microgravity) are often dramatically different because of the absence of buoyancy and thus rising hot gases. Instead of a flickering teardrop, a candle flame becomes a ghostly blue sphere reliant on diffusion for its oxygen.

NASA’s spacecraft fire safety work is focused on prevention, detection, and suppression. Prevention is achieved by controlling ignition sources and through material selection, which depends on understanding flammability limits. To facilitate spacesuit use, an atmosphere with increased oxygen and reduced pressure compared to Earth’s is expected within the planned Moon Base and pressurized rovers. Flammability is highly dependent on oxygen concentration, and air flow is also important in microgravity. Flammability studies focus on solid materials such as fabrics and plastics, as studied in the Burning and Suppression of Solids (BASS and BASS-II) and Spacecraft Fire Safety Demonstration (Saffire-I, -II, and -III) investigations.

Fire detection was tested in microgravity through the Smoke and Aerosol Measurement Experiment studies (SAME and SAME-R). Suppression was studied in the Flame Extinguishment Experiment (FLEX) through dilution of the chamber atmosphere with carbon dioxide and helium, both of which suppress fire.

## **Objectives**

Results from low-gravity combustion experiments, conducted for example on the International Space Station (ISS), are being made publicly available through NASA's Physical Science Informatics (PSI) database, but the amount of data can be overwhelming. It can be hard to find, harder to compare, and harder yet to interpret.

Your challenge is to build an SI-powered, web-based dashboard that summarizes, ranks, and interprets combustion science investigations to deliver critical foundational insights for fire safety. You may consider enabling users to:

- Identify investigations most relevant to the fire safety needs of habitable crew environments, including spacecraft, space stations, bases on the lunar and Martian surfaces, and pressurized rovers.*
- Extract data that supports predictive modeling of flammability and fire scenarios in space exploration.
- Highlight research that informs the development of next-generation fire safety controls and equipment.

In this challenge, you’ll help turn complex data into clear answers and make the next giant leap a safer one.

Your dashboard could also address potential applications of the PSI data to fire safety on Earth. Fine-water-mist extinguishers developed for use on the ISS have practical applications here on Earth, and NASA technology has similarly led to improvements in terrestrial smoke detection and firefighter gear, including protective clothing and air tanks.

- *Fire safety involving rockets and propellants is generally beyond the scope of the research available in the PSI database. The high velocities within rocket engines render the combustion effectively independent of gravity — although a rocket’s launch is of course strongly dependent on gravity.*

## **Potential Considerations**

*You may (but are not required to) consider the following:*

- 
- Consider how you might summarize and display attributes such as:
    - Experimental objectives
    - Fuels, including shape and size of the samples or burners
    - Other test conditions, such as oxygen concentration and airflow speed
    - Variables: how did tests from the same investigation differ and how were they the same?
    - Sensors or types of measurements
- Consider how to summarize and display similarities and differences between different investigations.
- Other investigations in PSI
    - One of the instruments used for smoke detection in the SAME and SAME-R studies was instead used to detect dust in the Dust and Aerosol Measurement Feasibility Test (DAFT and DAFT-2) studies.
    - While it burned gaseous fuels, the Burning Rate Emulator (BRE) experiment of the Advanced Combustion via Microgravity Experiments (ACME) project was a study of materials flammability in still atmospheres as a function of material properties.
    - Other combustion investigations within the PSI database (but not explicitly referenced above) are still relevant to fire safety, just not as strongly or directly.
- Hardware
    - The six experiments in the ACME project featured flames of gaseous fuels and were all conducted with the same modular set of ACME hardware in the Combustion Integrated Rack (CIR).
    - FLEX, FLEX-2, and the Cool Flames Investigation (CFI) each featured burning droplets of liquid fuel and were conducted with the Multi-user Droplet Combustion Apparatus (MDCA) in the CIR.
    - BASS, BASS-II, the Smoke Point In Co-flow Experiment (SPICE), and the Structure & Liftoff In Combustion Experiment (SLICE) collectively featured both solid and gaseous fuels. Each of these investigations was conducted within the Microgravity Science Glovebox (MSG) using the modular fan-driven flow duct built for SPICE.
- Spacesuits and oxygen concentration
    - To enable flexibility, spacesuits are filled with 100% oxygen to only 4.3 psi (pounds per square inch), where the Earth’s pressure at sea level is 14.7 psi.
    - To avoid the bends (decompression sickness), the astronauts pre-breathe 100% oxygen to expel absorbed nitrogen.
    - To reduce the pre-breathing duration and thus facilitate lunar excursions, it is expected that the Moon Base and pressurized rover(s) will be at a pressure and oxygen concentration between those in a spacesuit and the Earth’s atmosphere.
    - The intermediate oxygen concentration used on the Moon will likely be 30% or greater, with a corresponding pressure of 10.2 psi or less. Compared to Earth’s atmosphere, that’s more than a 40% increase in the oxygen concentration making materials much more flammable.
    - Microgravity tests with the highest oxygen concentrations were conducted as part of the ACME’s Cool Flames Investigation with Gases (CFI-G). In those tests, the combustion chamber was filled with a mixture of nitrogen and a flammable gas (e.g., propane), while an oxygen-nitrogen mixture of up to 85% oxygen flowed from the spherical burner creating an inside-out flame.
- Partial-gravity data
    - Although NASA is heavily focused on the return of astronauts to the Moon’s surface and the establishment of a Moon Base in preparation for the future human exploration of Mars, there is currently no partial-gravity combustion data available in PSI. We expect such data will be added in the future, for example from the Lunar-g Combustion Investigation (LUCI) and the Flammability of Materials on the Moon (FM2) experiment.
    - Partial gravity was mimicked in ACME’s Electric-Field Effects on Laminar Diffusion Flames (E-FIELD Flames) experiment through the effect of the electric field on the ions that naturally occur in flames.
    - Microgravity and normal-gravity results could bound what occurs at intermediate gravity levels.