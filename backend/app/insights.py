"""Fire Safety Insights: what the collected NASA research says about preventing,
detecting and extinguishing fires in space.

Every point carries evidence: a verbatim quote from a PSI record field, from the
NASA challenge description, or from one of the official NASA resources listed for
the challenge (source "RES-n": the Researcher's Guide, NASA's Combustion Science
page, the Apollo 1, Apollo 13 and Mir pages, the Spinoff articles, the ScienceCast
captions). `verify()` runs at startup and raises if any quote cannot be found in
its source, so the page cannot drift away from the data.
The explanatory sentences are the project team's own plain-language wording.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pandas as pd

from . import store

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ingest"))
from challenge_text import CHALLENGE_PASSAGES  # noqa: E402

E = lambda src, section, quote: {"source": src, "section": section, "quote": quote}  # noqa: E731

SECTIONS: list[dict] = [
    {
        "id": "prevention",
        "title": "Fire prevention",
        "meaning": "Reducing the chance that a fire starts or spreads, mainly by choosing materials that will not "
                   "keep burning in the cabin atmosphere.",
        "cards": [
            {
                "title": "A material that passes the ground test may still burn in space",
                "text": "NASA screens spacecraft materials with an upward-burning test in normal gravity. BASS and "
                        "BASS-II were built around the hypothesis that this test may not be the worst case: with "
                        "ventilation, a material in microgravity could burn as well as, or better than, on Earth.",
                "evidence": [
                    E("PSI-25", "hypothesis", "NASA tests and controls materials from a flammability perspective using an upward burning test in normal gravity, which is considered to be the worst-case geometry for flammability of the material on Earth. However, it may not be conservative for flammability in space."),
                    E("PSI-26", "impacts", "segregates material based on 1-g behavior without consideration of low gravity effects"),
                    E("RES-4", None, "Microgravity experiments demonstrated that the assumed margin of safety of reduced flammability in microgravity, based on quiescent test results, may not be valid for most spacecraft environments where ventilation flow strongly enhances flames."),
                    E("RES-4", None, "In the low-flow conditions of microgravity or partial gravity, some materials are flammable at lower oxygen concentrations than in normal gravity (Figure 8)."),
                ],
                "limits": "These are the stated hypothesis and motivation. The measured flammability limits are in the "
                          "linked publications and the PSI run data, not in the record summary.",
                "conditions_from": ["PSI-25", "PSI-26"],
            },
            {
                "title": "Oxygen concentration is the strongest lever, and exploration habitats will raise it",
                "text": "Flammability depends strongly on oxygen level. A Moon Base is expected to use 30% oxygen or "
                        "more at reduced pressure. In BRE, flames in elevated-oxygen atmospheres kept burning without "
                        "any airflow, while flames in 21% oxygen went out on their own.",
                "evidence": [
                    E("CHALLENGE", "Spacesuits and oxygen concentration", "The intermediate oxygen concentration used on the Moon will likely be 30% or greater, with a corresponding pressure of 10.2 psi or less."),
                    E("PSI-20", "impacts", "The ongoing combustion without air flow was notably seen in elevated-oxygen atmospheres which are being considered for use in future spacecraft, whereas such flames in a normal atmosphere of 21% oxygen self-extinguished in a short time."),
                    E("PSI-25", "approach", "Main variables are airflow speed and oxygen concentration (oxygen varied below 21% by adding nitrogen)."),
                    E("RES-4", None, "spacecraft frequently operate at an ambient oxygen mole fraction higher than that of air, have limited options for escape, and have almost no tolerance for damage to critical life support systems"),
                    E("RES-5", None, "Because of the pure oxygen atmosphere, the fire spread quickly, causing a rapid rise in temperature and pressure that led to the rupture of the Command Module pressure vessel."),
                ],
                "limits": "BRE used a gas burner that imitates solid and liquid fuels, not real cabin materials, and its "
                          "PSI record calls the results preliminary. The solid-material tests in this collection "
                          "(BASS-II, Saffire) report oxygen at or below about 22%.",
                "conditions_from": ["PSI-20", "PSI-25"],
            },
            {
                "title": "Airflow feeds a microgravity flame",
                "text": "Without buoyancy, a flame depends on ventilation to bring it fresh oxygen, so airflow speed "
                        "and direction decide whether a flame spreads or dies. BASS and BASS-II varied airflow up to "
                        "40 cm/s; the Saffire fires were run at 20 and 30 cm/s.",
                "evidence": [
                    E("CHALLENGE", "Background: prevention, detection, suppression", "Flammability is highly dependent on oxygen concentration, and air flow is also important in microgravity."),
                    E("PSI-25", "approach", "Fuel samples were mounted inside a small wind tunnel which could impose airflow speeds up to 40 cm/s."),
                    E("PSI-100", "approach", "the experiments were conducted at a flow velocity of 30 cm/s compared to 20 cm/s during Saffire I"),
                ],
                "limits": "Airflow ranges are those of the test hardware. Real cabin ventilation varies from place to "
                          "place, and still-air pockets were not the subject of these flow-duct tests.",
                "conditions_from": ["PSI-25", "PSI-26", "PSI-98", "PSI-99", "PSI-100"],
            },
            {
                "title": "Fires at realistic size had not been tested before Saffire",
                "text": "Small samples cannot show how a large fire grows. The Saffire experiments burned samples up to "
                        "about a metre long inside an uncrewed Cygnus cargo ship, where a large fire puts no crew at risk.",
                "evidence": [
                    E("PSI-98", "hypothesis", "There is a significant lack of microgravity data available for spacecraft designers on which to base their fire safety designs and procedures."),
                    E("PSI-98", "objective", "determine how rapidly a large scale fire grows in low-gravity"),
                    E("PSI-99", "approach", "the Saffire-II investigation added more samples including SIBAL, silicone, structure PMMA, flat PMMA, and PMMA with Nomex"),
                ],
                "limits": "The PSI run tables for Saffire-I to -III list a handful of samples at about 21.5 to 22.1% "
                          "oxygen and 20 to 30 cm/s airflow. They do not cover oxygen-enriched atmospheres.",
                "conditions_from": ["PSI-98", "PSI-99", "PSI-100"],
            },
        ],
    },
    {
        "id": "detection",
        "title": "Fire detection",
        "meaning": "Noticing smoke or fire early. In microgravity smoke does not rise toward a ceiling detector, and "
                   "the smoke particles themselves are different.",
        "cards": [
            {
                "title": "Smoke particles are expected to be larger in microgravity",
                "text": "Without buoyant flow, smoke stays near its source longer and particles have more time to grow. "
                        "SAME and SAME-R were designed to measure this, because larger and fewer particles change how "
                        "a smoke detector responds.",
                "evidence": [
                    E("PSI-102", "hypothesis", "it is hypothesized that liquid aerosol smokes produced in microgravity will exhibit substantially larger droplet sizes than under the same conditions in normal gravity"),
                    E("PSI-102", "hypothesis", "The change in the size distribution and number density will, in turn, affect the response of the smoke detectors and possibly result in some detectors not producing an alarm when exposed to this smoke."),
                    E("RES-4", None, "Since many fire detectors operate by sensing fire-generated particulates, they would need to use different signatures to detect fires in microgravity."),
                ],
                "limits": "This is the hypothesis recorded in PSI. The tests used smoke from a small set of overheated "
                          "materials at low airflow; a detector response measured there is not a validation for every "
                          "spacecraft environment, material or airflow.",
                "conditions_from": ["PSI-102", "PSI-101"],
            },
            {
                "title": "What was measured, and with which instruments",
                "text": "SAME exposed two smoke detectors to smoke from overheated spacecraft materials and collected "
                        "particles for electron-microscope analysis. SAME-R repeated the work with a new material, "
                        "wider test conditions and a new instrument.",
                "evidence": [
                    E("PSI-102", "approach", "The operator then ran the self diagnostic procedures on the two smoke detectors and activated the video cameras"),
                    E("PSI-102", "approach", "analyzed using a Transmission Electron microscope (TEM) to determine primary and aggregate particle dimensions"),
                    E("PSI-101", "approach", "test conditions were broadened including higher heating temperatures and no-flow during sample heating time"),
                ],
                "limits": "SAME-R exists partly because of a problem in SAME: the PSI record states that the returned "
                          "microscope grids were contaminated and unusable.",
                "limit_evidence": [
                    E("PSI-101", "objective", "all the TEM grids were severely contaminated with some unidentified foreign particles, making these grids unusable"),
                ],
                "conditions_from": ["PSI-102", "PSI-101"],
            },
            {
                "title": "Instruments must be re-qualified for microgravity",
                "text": "A commercial particle counter used gravity to recycle its working fluid. DAFT tested a modified "
                        "version on the ISS before it was trusted for smoke measurements in SAME.",
                "evidence": [
                    E("PSI-47", "objective", "P-Trak would not be reliable in microgravity as it relies on gravity to recycle isopropyl alcohol"),
                    E("PSI-47", "objective", "Compare the TSI P-Trak Performance against the DustTrak control"),
                ],
                "limits": "DAFT measured test dust, not smoke. It validates the instrument, not a fire detector.",
                "conditions_from": ["PSI-47"],
            },
            {
                "title": "Gravity changes the smoke itself",
                "text": "A ground study used SAME conditions to simulate smoke growth with and without gravity, and "
                        "SPICE measured the point at which a non-buoyant gas flame starts to release soot.",
                "evidence": [
                    E("PSI-115", "objective", "quantify the differences between microgravity and Earth gravity smoke"),
                    E("PSI-115", "hypothesis", "Without buoyancy, mixing and heat transfer are reduced"),
                    E("PSI-107", "approach", "Fuel flow rates were adjusted to identify the smoke point"),
                ],
                "limits": "PSI-115 is a numerical simulation of one smoke-producing liquid. SPICE burned gaseous fuels, "
                          "not cabin materials.",
                "conditions_from": ["PSI-115", "PSI-107"],
            },
        ],
    },
    {
        "id": "suppression",
        "title": "Fire suppression",
        "meaning": "Putting a fire out. In microgravity an extinguishing gas is not carried to the flame by buoyancy, "
                   "so agents can behave differently than on Earth.",
        "cards": [
            {
                "title": "Diluting the air with carbon dioxide or helium",
                "text": "FLEX burned single fuel droplets while replacing part of the chamber atmosphere with carbon "
                        "dioxide or helium, to find the lowest oxygen level that still supports a flame and how each "
                        "gas shifts that limit. The table below is computed from the FLEX run log in PSI.",
                "evidence": [
                    E("CHALLENGE", "Background: detection and suppression studies", "Suppression was studied in the Flame Extinguishment Experiment (FLEX) through dilution of the chamber atmosphere with carbon dioxide and helium, both of which suppress fire."),
                    E("PSI-69", "objective", "measure the effectiveness of various gaseous fire suppressants such as CO2, He, and SF6"),
                    E("PSI-69", "approach", "determine the Limiting Oxygen Index (LOI) as a function of ambient pressure and determine how the presence of a suppressant influences the LOI"),
                ],
                "limits": "FLEX burned droplets of methanol and heptane, not solid cabin materials. SF6 is named in the "
                          "objective, but the PSI run log has no SF6 column, so SF6 results are not reported here.",
                "conditions_from": ["PSI-69"],
                "data": "flex_suppression",
            },
            {
                "title": "Nitrogen on burning solids",
                "text": "BASS tested an inert extinguishing gas, similar to the one used on the ISS, on flames over "
                        "solid materials in different shapes and airflows.",
                "evidence": [
                    E("PSI-26", "objective", "Assess the effectiveness of an inert, gaseous extinguishing agent (similar to that used on ISS) in putting out flames over different materials, geometries, preheating, and flow."),
                    E("PSI-26", "impacts", "Using nitrogen as a flame suppressant in microgravity provides a direct link to current and planned extinguishment techniques."),
                ],
                "limits": "The BASS run table in PSI lists the samples burned but has no column for agent flow or "
                          "extinction outcome, so the extinction results themselves are not reported in this collection.",
                "conditions_from": ["PSI-26"],
            },
            {
                "title": "Switching off ventilation is not always enough",
                "text": "Stopping airflow is a standard first response to a spacecraft fire. BRE observed sustained "
                        "burning with no airflow at all in elevated-oxygen atmospheres.",
                "evidence": [
                    E("PSI-20", "impacts", "was observed in microgravity despite the absence of air flow, where the cessation of ventilation is an established step in putting out spacecraft fires"),
                    E("RES-4", None, "This resulted in several critical misconceptions about potential fires in spacecraft: 1. A steady fire cannot exist in a quiescent microgravity environment. 2. A fire will self-extinguish if ventilation is shut off."),
                ],
                "limits": "Reported as preliminary in the PSI record, with a gas burner emulating condensed fuels.",
                "conditions_from": ["PSI-20"],
            },
            {
                "title": "Water mist: from flight research to the extinguishers on the ISS",
                "text": "NASA's Researcher's Guide describes a shuttle experiment (Mist, 2003) that measured how "
                        "water droplets weaken a flame, and the water-mist portable extinguishers that were later "
                        "certified for spaceflight. The first two went to the ISS in December 2015 to replace "
                        "carbon-dioxide units.",
                "evidence": [
                    E("RES-4", None, "Past research involved a space experiment that focused on measuring the extinguishing capability of water mist on a premixed flame propagating along a tube"),
                    E("RES-4", None, "After years of research, testing, flight experiments, and advocating the benefits of water-mist technology, non-toxic water-mist portable fire extinguishers were designed, tested, fabricated and certified for spaceflight."),
                    E("RES-4", None, "The first two of the planned nine water-mist portable fire extinguishers were sent to the ISS in December 2015 to replace CO2 units that are currently onboard."),
                    E("CHALLENGE", "Earth applications", "Fine-water-mist extinguishers developed for use on the ISS have practical applications here on Earth"),
                ],
                "limits": "The Mist experiment is not one of the 24 PSI combustion investigations in this collection, "
                          "so this site holds no run data on water mist. The Research Gaps page counts it as an "
                          "agent with no experiment here.",
            },
            {
                "title": "Cool flames complicate the question of when a fire is out",
                "text": "Droplet experiments in microgravity showed low-temperature 'cool flames'. Follow-on PSI studies "
                        "map when a cool flame keeps going, flips back to a hot flame, or goes out.",
                "evidence": [
                    E("PSI-117", "objective", "transitions to hot ignition and warm-flame behavior, and extinction under microgravity"),
                    E("PSI-39", "objective", "Investigate the relationship between droplet size, pressure, and flame extinction"),
                    E("PSI-142", "objective", "Bridge the knowledge gap between the flammability limits and extinction limits of hot flames and cool flames."),
                ],
                "limits": "Studied for liquid fuel droplets and gas flames. The collection has no cool-flame data for "
                          "solid cabin materials.",
                "conditions_from": ["PSI-39", "PSI-159"],
            },
        ],
    },
]

NEXT_GEN: list[dict] = [
    {"title": "Advanced smoke detectors",
     "text": "Smoke measurements in microgravity give the baseline against which new detector designs can be judged.",
     "evidence": [
         E("PSI-102", "impacts", "provide the reduced gravity baseline data against which future detection technology developments can be evaluated"),
         E("RES-4", None, "One of the achievements in this area is a new device that monitors particulates and chemical species simultaneously to better detect the onset of a fire."),
     ]},
    {"title": "More efficient, less harmful suppression systems",
     "text": "Knowing how much of each gas is needed lets designers pick agents that work with less toxic by-product.",
     "evidence": [E("PSI-69", "impacts", "can lead to the development of more efficient and less harmful fire suppression systems, reducing the risk of toxic byproducts during fire events")]},
    {"title": "Better material screening tests",
     "text": "BRE points toward using a different standard test, and modeling work aims at tools that predict a new "
             "material's flammability limits.",
     "evidence": [
         E("PSI-20", "impacts", "they suggest that NASA may want to increase use of its alternative flammability Test 2, with the cone calorimeter"),
         E("PSI-62", "impacts", "This research provides predictive tools for screening new materials"),
     ]},
    {"title": "Validated design criteria for exploration vehicles",
     "text": "Large-scale fire tests check whether today's material selection rules hold at realistic fire sizes.",
     "evidence": [E("PSI-98", "impacts", "Results determine microgravity flammability limits for several spacecraft materials")]},
]

EARTH_VS_MICRO: dict = {
    "example": {
        "title": "A plain-language example: the candle",
        "text": "Light a candle on Earth and the hot gas rises, pulling fresh air in at the base. That gives the "
                "familiar tall, flickering teardrop. In free fall nothing rises, so the flame becomes a small blue "
                "sphere that only gets oxygen as fast as it can drift in by diffusion. The flame is weaker, but it "
                "is also fed by any airflow at all: a cabin fan can do the job that buoyancy does on Earth.",
        "evidence": [
            E("CHALLENGE", "Background: flames in microgravity", "Instead of a flickering teardrop, a candle flame becomes a ghostly blue sphere reliant on diffusion for its oxygen."),
            E("PSI-25", "impacts", "In outer space, fuels burn as oval balls rather than with an upward pointed cone flame as they do on Earth."),
            E("RES-2", None, "The resultant flow instabilities cause the flicker typical of flames on Earth."),
            E("RES-3", None, "But on the ISS, there's no flicker which allows us to make more precise and consistent measurements."),
        ],
    },
    "points": [
        {"aspect": "Flame shape and oxygen supply",
         "earth": "Hot gases rise (buoyancy), drawing fresh air into the flame.",
         "micro": "No buoyant flow. Oxygen arrives by diffusion or by forced ventilation.",
         "evidence": [E("CHALLENGE", "Background: flames in microgravity", "are often dramatically different because of the absence of buoyancy and thus rising hot gases")]},
        {"aspect": "Material flammability",
         "earth": "Upward burning in normal gravity is treated as the worst case in NASA's screening test.",
         "micro": "With ventilation, a material may burn as well as or better than on Earth (BASS hypothesis).",
         "evidence": [E("PSI-26", "hypothesis", "materials in microgravity, with adequate ventilation, burn as well if not better than the same material in normal gravity")]},
        {"aspect": "Smoke",
         "earth": "Buoyant flow mixes and carries smoke upward; particles stay small.",
         "micro": "Smoke lingers near the source; particles are expected to grow larger and fewer.",
         "evidence": [E("PSI-102", "hypothesis", "will lead to larger particles compared to those produced in 1g")]},
        {"aspect": "Suppression",
         "earth": "Buoyant convection affects how extinguishing agents reach the flame.",
         "micro": "Flammability limits and agent effectiveness are expected to differ.",
         "evidence": [E("PSI-69", "hypothesis", "the lack of buoyant convection in microgravity will lead to significant differences in the flammability limits and suppression efficacy of various fire suppressant agents compared to normal gravity conditions")]},
        {"aspect": "Partial gravity (Moon, Mars)",
         "earth": "Not applicable.",
         "micro": "No partial-gravity combustion data in PSI yet. Microgravity and Earth results can only bound it.",
         "evidence": [
             E("CHALLENGE", "Partial-gravity data", "there is currently no partial-gravity combustion data available in PSI"),
             E("CHALLENGE", "Partial-gravity data", "Microgravity and normal-gravity results could bound what occurs at intermediate gravity levels."),
         ]},
    ],
    "data": "saffire2_gravity",
}

EARTH_APPLICATIONS: list[dict] = [
    {"title": "Extinguishers, smoke detection and firefighter gear",
     "text": "Technology developed for spacecraft fire safety has already been applied on Earth.",
     "evidence": [
         E("CHALLENGE", "Earth applications", "Fine-water-mist extinguishers developed for use on the ISS have practical applications here on Earth, and NASA technology has similarly led to improvements in terrestrial smoke detection and firefighter gear, including protective clothing and air tanks."),
         E("RES-3", None, "Combustion experiments conducted in space have contributed to practical applications on Earth, especially in the field of fire safety."),
     ]},
    {"title": "Lighter air tanks for firefighters (1970s)",
     "text": "NASA's Johnson Space Center and a manufacturer developed a lighter breathing system for firefighters: "
             "a 20-pound backpack holding 30 minutes of air at twice the earlier pressure, with a face mask that "
             "gives better vision and a low-air warning only the wearer hears.",
     "evidence": [
         E("RES-8", None, "New backpack system weighs only 20 pounds for 30 minute air supply, 13 pounds less than conventional firefighting tanks."),
         E("RES-8", None, "Made of aluminum liner wrapped by resin-impregnated glass fibers, eliminating corrosion as well as lightening the load."),
     ],
     "limits": "A NASA Spinoff article about a product. It is not PSI data and reports no test results."},
    {"title": "A fire detector that tells smoke from dust (1970s)",
     "text": "A detector first used in the space shuttle orbiters samples the air for combustion particles and can "
             "tell them from dust, so it gives fewer false alarms; linked sensors can watch a large site such as a "
             "mine. Smoke or dust is also the question behind DAFT and SAME in this collection, which used the same "
             "instrument for both.",
     "evidence": [
         E("RES-9", None, "can discriminate between combustion particles and extraneous matters such as dust"),
         E("RES-9", None, "For large area applications such as mines, any number of sensors can be linked to a central processor/display unit to provide a central fire watch system that would instantly warn of incipient fire and pinpoint the location."),
         E("CHALLENGE", "Other investigations in PSI", "One of the instruments used for smoke detection in the SAME and SAME-R studies was instead used to detect dust in the Dust and Aerosol Measurement Feasibility Test (DAFT and DAFT-2) studies."),
     ],
     "limits": "The Spinoff detector and the SAME instruments are different devices. The article gives no "
               "measurements."},
    {"title": "Firefighter clothing from spacesuit materials (1980s)",
     "text": "Project FIRES, sponsored by NASA and the U.S. Fire Administration, brought lightweight, fire-resistant, "
             "heat-protective materials developed for spacesuits and spacecraft into firefighter gear, tried out by "
             "fourteen fire departments.",
     "evidence": [
         E("RES-10", None, "A major focus of the effort involves application to the FIRES ensemble of lightweight, fire-resistant, heat-protective materials originally developed for use in astronauts' space suits or in spacecraft components which require thermal protection."),
         E("RES-10", None, "Although little can be done to reduce the risks of firefighting, something can be done to curb the injuries and fatalities."),
     ],
     "limits": "A NASA Spinoff article about a programme. It is not PSI data."},
    {"title": "Fire safety in sealed, confined places",
     "text": "A spacecraft is a small sealed volume; so are mines, aircraft cabins and submarines.",
     "evidence": [
         E("PSI-98", "impacts", "benefits fire safety and prevention efforts on Earth, including inside mines, airplanes, or submarines"),
         E("PSI-102", "impacts", "can also be useful in other extreme environments on Earth, such as submarines or underwater laboratories"),
     ]},
    {"title": "Better fire models for buildings and wildfires",
     "text": "Flames without buoyancy are simpler, which makes them a clean test for computer models that are then "
             "used on Earth fires.",
     "evidence": [E("PSI-25", "impacts", "These models can then be used to more accurately study flames on Earth, such as in wildfires, building fires, energy recapture from waste recycling, and other combustion problems.")]},
    {"title": "Cleaner engines and fuels",
     "text": "Cool-flame and droplet research feeds the design of more efficient, lower-emission engines.",
     "evidence": [E("PSI-39", "impacts", "Cool flames play a key role in the development and selection of new fuels and the design of advanced engines")]},
]


# What three real accidents taught, from NASA's own lessons-learned and history pages (official
# challenge resources). They are history, not experiments: no measurement on this site comes from them.
LESSONS: list[dict] = [
    {
        "id": "apollo-1", "resource": "RES-5", "when": "27 January 1967", "where": "On the launch pad, normal gravity",
        "title": "Apollo 1: a pure-oxygen cabin turned a fault into a fatal fire",
        "text": "During a launch-pad rehearsal the sealed cabin was filled with 100% oxygen. A fire spread through "
                "the Command Module within seconds and the crew could not open the hatch in time. Investigators "
                "could not name the ignition source but found arcing in the wiring. NASA then cut back and "
                "controlled the combustible materials in the cabin, redesigned the hatch and made spacesuits from "
                "fire-resistant materials.",
        "evidence": [
            E("RES-5", None, "the cabin pressurized with 100% oxygen"),
            E("RES-5", None, "Because of the pure oxygen atmosphere, the fire spread quickly, causing a rapid rise in temperature and pressure that led to the rupture of the Command Module pressure vessel."),
            E("RES-5", None, "Additionally, NASA severely restricted and controlled the number of combustible materials in the spacecraft and made those changes in the Lunar Module as well."),
            E("RES-5", None, "As another safeguard, the agency designed new spacesuits using fire-resistant materials."),
        ],
        "today": "Oxygen level and material choice are still the two main prevention levers, and they are what "
                 "BASS-II, the Saffire fires and BRE measure. A Moon Base at 30% oxygen or more sits between "
                 "station air and the Apollo 1 cabin; the Research Gaps page shows how far the solid-material "
                 "tests in this collection reach toward it.",
        "ids": ["PSI-25", "PSI-98", "PSI-20"], "to": "/insights#prevention", "link": "Fire prevention insights",
        "limits": "An accident history, not a controlled test: it gives no measured flammability limits. The fire "
                  "happened on the ground, in normal gravity and in 100% oxygen.",
    },
    {
        "id": "apollo-13", "resource": "RES-6", "when": "April 1970", "where": "On the way to the Moon",
        "title": "Apollo 13: an oxygen tank damaged on the ground exploded in flight",
        "text": "Heater switches in an oxygen tank were never updated for a higher voltage. During a launch-pad "
                "test the heaters overheated and damaged the insulation inside the tank, and on the third day of "
                "the flight the tank blew up and took the second tank with it. The crew returned safely. NASA "
                "redesigned the oxygen tank system and sheathed its wiring in stainless steel.",
        "evidence": [
            E("RES-6", None, "During the final test on the launch pad, the heaters were left on for an extended period and reached temperatures around 1000 degrees Fahrenheit, degrading the Teflon insulation."),
            E("RES-6", None, "oxygen tank number two blew up, leading to the subsequent failure of tank number one"),
            E("RES-6", None, "The report found that the accident was a combination of mistakes and a deficient design."),
            E("RES-6", None, "redesigned the oxygen tank system by adding a third tank in a different bay, upgrading thermostats, removing stirring fans and sheathing all electrical wiring in stainless steel"),
            E("RES-4", None, "A fire or explosion requires all elements of the “fire triangle” to be present: fuel, oxygen and a source of ignition. Crewed spacecraft, by necessity, contain all three."),
        ],
        "today": "This was an explosion, not a cabin fire, but the ingredients are the same three: oxygen, something "
                 "that can burn and a source of ignition. It is why oxygen level runs through every page of this "
                 "site, from the Explorer filters to the test-envelope chart.",
        "ids": ["PSI-159", "PSI-20"], "to": "/charts?view=envelope", "link": "Where has NASA tested? (oxygen and pressure)",
        "limits": "NASA's page describes the cause in general terms. It is not combustion data, and nothing on the "
                  "Charts or What-If pages comes from it.",
    },
    {
        "id": "mir", "resource": "RES-7", "when": "24 February 1997", "where": "In orbit, microgravity",
        "title": "Mir: a fire in orbit blocked an escape route and filled the station with smoke",
        "text": "A solid-fuel oxygen generator canister ignited and threw a flame across the module. It cut off the "
                "way to one of the two Soyuz escape craft and filled the station with dense smoke. The crew put on "
                "oxygen masks and fought it with foam extinguishers; the life support system cleared the smoke over "
                "several hours. Investigators later traced the most likely cause to material that got into the "
                "canister by mistake.",
        "evidence": [
            E("RES-7", None, "the canister ignited, shooting a three-foot flame with sparks and bits of molten metal across the module and generating a large quantity of dense smoke"),
            E("RES-7", None, "The flame blocked the evacuation route to the Soyuz spacecraft docked at the aft end of Kvant-1"),
            E("RES-7", None, "The crew quickly donned oxygen masks, and Korzun began dousing the flame with foam from a fire extinguisher"),
            E("RES-7", None, "After two years of study, investigators determined that hydrocarbons introduced into the canister increased the risk of problems."),
            E("RES-7", None, "The lessons learned from the incident were passed on in the design and operations of the International Space Station."),
        ],
        "today": "This is what the detection and suppression experiments prepare for: smoke that does not rise or "
                 "clear by itself, and a crew that has to find and fight the fire on the spot. SAME and SAME-R "
                 "measured smoke in microgravity; FLEX and BASS studied how flames are put out.",
        "ids": ["PSI-102", "PSI-101", "PSI-69", "PSI-26"], "to": "/insights#detection", "link": "Fire detection insights",
        "limits": "A history article, not a measurement. The generator supplied its own oxygen, so this fire does "
                  "not show how cabin materials burn in cabin air.",
    },
]


def _norm(s: str) -> str:
    s = s.replace("’", "'").replace("‘", "'").replace("–", "-").replace("—", "-")
    s = s.replace("“", '"').replace("”", '"').replace("‑", "-")
    return re.sub(r"\s+", " ", s).strip().lower()


def _all_evidence():
    for sec in SECTIONS:
        for card in sec["cards"]:
            yield from card["evidence"]
            yield from card.get("limit_evidence", [])
    for item in NEXT_GEN + EARTH_APPLICATIONS + LESSONS:
        yield from item["evidence"]
    yield from EARTH_VS_MICRO["example"]["evidence"]
    for p in EARTH_VS_MICRO["points"]:
        yield from p["evidence"]


_CHALLENGE = {title: _norm(text) for title, text in CHALLENGE_PASSAGES}
_res_norm: dict[str, str] = {}


def is_resource(ev: dict) -> bool:
    return ev["source"].startswith("RES-")


def usable(evs: list[dict]) -> list[dict]:
    """Evidence that can be shown. Quotes from the official NASA resources need data/resources.json
    (ingest/build_resources.py); without it they are left out instead of being shown unchecked."""
    return [e for e in evs if not is_resource(e) or e["source"] in store.RESOURCES]


def quote_ok(ev: dict) -> bool:
    """Is the quote in its source, word for word (ignoring typographic quotes and spacing)?"""
    if ev["source"] == "CHALLENGE":
        return _norm(ev["quote"]) in _CHALLENGE.get(ev["section"], "")
    if is_resource(ev):
        if ev["source"] not in _res_norm:
            _res_norm[ev["source"]] = _norm(store.RES_TEXT.get(ev["source"], ""))
        return _norm(ev["quote"]) in _res_norm[ev["source"]]
    inv = store.INVS.get(ev["source"])
    return bool(inv) and _norm(ev["quote"]) in _norm(inv["text"].get(ev["section"], ""))


def verify() -> None:
    _res_norm.clear()
    bad = [f"{ev['source']} / {ev['section']}: {ev['quote'][:80]}" for ev in usable(list(_all_evidence()))
           if not quote_ok(ev)]
    if bad:
        raise RuntimeError("Insight quotes not found in their sources:\n  " + "\n  ".join(bad))


def _conditions(ids: list[str]) -> list[dict]:
    out = []
    for i in ids:
        inv = store.INVS[i]
        out.append({"id": i, "short": inv["short"], "materials": inv["materials"],
                    "conditions": inv["conditions"], "gravity": inv["gravity"]["label"], "n_runs": inv["n_runs"]})
    return out


def _decorate(ev: dict) -> dict:
    if ev["source"] == "CHALLENGE":
        return {**ev, "short": "NASA challenge description", "label": ev["section"]}
    if is_resource(ev):
        # say where in the resource the quote is: the heading, the PDF page or the time in the video
        res = store.RESOURCES[ev["source"]]
        quote = _norm(ev["quote"])
        hit = next((c for c in store.CHUNKS if c["investigation_id"] == res["id"] and quote in _norm(c["text"])), None)
        return {**ev, "source_type": "resource", "short": res["short"], "title": res["title"],
                "label": hit["section"] if hit else res["title"], "section": hit["section"] if hit else "",
                "url": hit["url"] if hit else res["url"]}
    inv = store.INVS[ev["source"]]
    labels = {"objective": "Objective", "approach": "Approach", "hypothesis": "Hypothesis",
              "impacts": "Research impacts"}
    return {**ev, "short": inv["short"], "label": labels[ev["section"]], "url": inv["links"]["psi"]}


def flex_suppression() -> dict:
    """Agent, concentration, fuel, pressure, oxygen and outcome from the FLEX run log (pandas)."""
    t = store.TABLES["PSI-69:1"]
    df = pd.DataFrame(t["rows"])
    num = lambda c: pd.to_numeric(df[c], errors="coerce")  # noqa: E731
    df["o2"] = num("O initial ambient composition; mole fraction") * 100
    df["co2"] = num("CO initial ambient composition; mole fraction") * 100
    df["he"] = num("He initial ambient composition; mole fraction") * 100
    df["p"] = num("Ambient pressure; mmHg").where(lambda s: s > 0) / 760

    def agent(r):
        if r.co2 > 0 and r.he > 0:
            return "CO2 + helium"
        if r.co2 > 0:
            return "Carbon dioxide"
        if r.he > 0:
            return "Helium"
        return "None (O2 / N2 only)"

    df["agent"] = df.apply(agent, axis=1)
    df["conc"] = df["co2"] + df["he"]
    rows = []
    for (fuel, ag), g in df.groupby(["Fuel", "agent"]):
        ends = g["Test end"].value_counts().to_dict()
        rows.append({
            "fuel": fuel, "agent": ag, "runs": int(len(g)),
            "agent_pct": None if ag.startswith("None") else [round(float(g.conc.min()), 1), round(float(g.conc.max()), 1)],
            "oxygen_pct": [round(float(g.o2.min()), 1), round(float(g.o2.max()), 1)],
            "pressure_atm": [round(float(g.p.min()), 2), round(float(g.p.max()), 2)],
            "extinction": int(ends.get("Extinction", 0)), "completion": int(ends.get("Completion", 0)),
            "disruption": int(ends.get("Disruption", 0)),
        })
    rows.sort(key=lambda r: (r["fuel"], r["agent"]))
    return {
        "kind": "flex_suppression", "table_id": t["id"], "source_url": t["source_url"], "rows": rows,
        "note": "Counted from the 'Test end' column of the PSI FLEX run log (274 tests). 'Extinction' means the "
                "flame went out before the droplet was consumed; 'Completion' means the droplet burned away; "
                "'Disruption' means the test ended for another reason. Counts describe what was tested, not a "
                "controlled comparison between agents.",
    }


def saffire2_gravity() -> dict:
    t = store.TABLES["PSI-99:1"]
    rows = []
    previous = None
    for r in t["rows"]:
        if not r["Sample Number"].startswith("2-"):
            continue  # pre-test flow visualisation rows are not burn samples
        material, carried = r.get("Material"), False
        if not material and previous:
            # the PSI table leaves the cell empty where the material repeats the row above
            material, carried = previous, True
        previous = material
        rows.append({
            "sample": r["Sample Number"], "material": material, "material_carried": carried,
            "thickness": r["Samle Thickness"],
            "flow": r["Flow Direction"], "oxygen": r["Percent O2 (Note 1)"],
            "micro_burn": r["?-g Burn Length"], "micro_spread": r["?-g Spread Length"],
            "earth_burn": r["1-g Burn Length"], "earth_spread": r["1-g Spread Rate"],
        })
    return {
        "kind": "saffire2_gravity", "table_id": t["id"], "source_url": t["source_url"], "rows": rows,
        "footnotes": t.get("footnotes", []),
        "note": "Values exactly as written in the PSI Saffire-II sample table. All samples: 20 cm/s airflow, about "
                "21.5 to 22.1% oxygen. Where the PSI table leaves the material cell empty, the material of the "
                "row above is shown and marked.",
    }


DATA = {"flex_suppression": flex_suppression, "saffire2_gravity": saffire2_gravity}


def payload() -> dict:
    def card(c: dict) -> dict:
        out = {"title": c["title"], "text": c["text"], "evidence": [_decorate(e) for e in usable(c["evidence"])]}
        if "limits" in c:
            out["limits"] = c["limits"]
            out["limit_evidence"] = [_decorate(e) for e in c.get("limit_evidence", [])]
        if "conditions_from" in c:
            out["tested"] = _conditions(c["conditions_from"])
        if "data" in c:
            out["data"] = DATA[c["data"]]()
        return out

    materials: dict[str, list[dict]] = {}
    for inv in sorted(store.INVS.values(), key=lambda i: store.sort_key(i["id"])):
        if any(f.startswith("solid") for f in inv["fuel_state"]) and inv["gravity"]["level"] == "microgravity":
            for m in inv["materials"]:
                materials.setdefault(m, []).append({"id": inv["id"], "short": inv["short"]})

    return {
        "sections": [{"id": s["id"], "title": s["title"], "meaning": s["meaning"],
                      "cards": [c for c in (card(c) for c in s["cards"]) if c["evidence"]],
                      "investigations": [store.card(i) for i in sorted(store.INVS.values(), key=lambda i: (-i["directness"], store.sort_key(i["id"])))
                                         if s["id"] in i["pillars"]]}
                     for s in SECTIONS],
        "material_coverage": [{"material": m, "investigations": v} for m, v in
                              sorted(materials.items(), key=lambda kv: (-len(kv[1]), kv[0]))],
        "next_gen": [card(c) for c in NEXT_GEN],
        "lessons": [{**card(c), "id": c["id"], "resource": c["resource"], "when": c["when"], "where": c["where"],
                     "today": c["today"], "to": c["to"], "link": c["link"],
                     "url": store.RESOURCES[c["resource"]]["url"],
                     "related": [{"id": i, "short": store.INVS[i]["short"]} for i in c["ids"] if i in store.INVS]}
                    for c in LESSONS if c["resource"] in store.RESOURCES],
        "earth_vs_micro": {
            "example": card(EARTH_VS_MICRO["example"]),
            "points": [{**p, "evidence": [_decorate(e) for e in usable(p["evidence"])]} for p in EARTH_VS_MICRO["points"]],
            "data": DATA[EARTH_VS_MICRO["data"]](),
        },
        # a card that rests only on a resource that was not built has nothing to show
        "earth_applications": [c for c in (card(c) for c in EARTH_APPLICATIONS) if c["evidence"]],
        "disclaimer": "Explanations are the project team's plain-language reading of the NASA sources quoted beside "
                      "them: PSI records, the NASA challenge description and the official NASA resources listed for "
                      "the challenge. This is a research aid, not a certified spacecraft safety assessment.",
    }
