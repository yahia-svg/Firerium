"""Verbatim passages from the NASA Space Apps challenge description
("Flame in Freefall"), as supplied in the project guide. They are indexed for the
AI assistant and quoted in the Fire Safety Insights pages, always cited as
"NASA challenge description" so they are never confused with a PSI record.
"""

CHALLENGE_SOURCE = {
    "id": "CHALLENGE",
    "name": "NASA challenge description",
    "title": "NASA Space Apps Challenge: Flame in Freefall (challenge description)",
}

CHALLENGE_PASSAGES = [
    ("Background: why fire in space matters",
     "Fire hazards are extremely dangerous in space exploration! In describing a smoke alarm that went off during the recent Artemis II mission, the commander commented, \"[If] you want to get somebody's attention really quick, make the fire alarm go off in your spacecraft when you're still about 80,000 miles from home.\" Decades earlier, the Apollo 13 crew endured the life-threatening results of an oxygen tank explosion on their way to the Moon. Similarly, a multinational crew survived a fire aboard the Mir space station caused by an oxygen generator failure. In 1967, the Apollo 1 crew died in a pre-launch test when fire erupted in their oxygen-filled spacecraft."),
    ("Background: flames in microgravity",
     "Compared to Earth, flames in free fall (i.e., in microgravity) are often dramatically different because of the absence of buoyancy and thus rising hot gases. Instead of a flickering teardrop, a candle flame becomes a ghostly blue sphere reliant on diffusion for its oxygen."),
    ("Background: prevention, detection, suppression",
     "NASA's spacecraft fire safety work is focused on prevention, detection, and suppression. Prevention is achieved by controlling ignition sources and through material selection, which depends on understanding flammability limits. To facilitate spacesuit use, an atmosphere with increased oxygen and reduced pressure compared to Earth's is expected within the planned Moon Base and pressurized rovers. Flammability is highly dependent on oxygen concentration, and air flow is also important in microgravity. Flammability studies focus on solid materials such as fabrics and plastics, as studied in the Burning and Suppression of Solids (BASS and BASS-II) and Spacecraft Fire Safety Demonstration (Saffire-I, -II, and -III) investigations."),
    ("Background: detection and suppression studies",
     "Fire detection was tested in microgravity through the Smoke and Aerosol Measurement Experiment studies (SAME and SAME-R). Suppression was studied in the Flame Extinguishment Experiment (FLEX) through dilution of the chamber atmosphere with carbon dioxide and helium, both of which suppress fire."),
    ("Earth applications",
     "Your dashboard could also address potential applications of the PSI data to fire safety on Earth. Fine-water-mist extinguishers developed for use on the ISS have practical applications here on Earth, and NASA technology has similarly led to improvements in terrestrial smoke detection and firefighter gear, including protective clothing and air tanks."),
    ("Scope: rockets and propellants",
     "Fire safety involving rockets and propellants is generally beyond the scope of the research available in the PSI database. The high velocities within rocket engines render the combustion effectively independent of gravity, although a rocket's launch is of course strongly dependent on gravity."),
    ("Other investigations in PSI",
     "One of the instruments used for smoke detection in the SAME and SAME-R studies was instead used to detect dust in the Dust and Aerosol Measurement Feasibility Test (DAFT and DAFT-2) studies. While it burned gaseous fuels, the Burning Rate Emulator (BRE) experiment of the Advanced Combustion via Microgravity Experiments (ACME) project was a study of materials flammability in still atmospheres as a function of material properties. Other combustion investigations within the PSI database (but not explicitly referenced above) are still relevant to fire safety, just not as strongly or directly."),
    ("Hardware families",
     "The six experiments in the ACME project featured flames of gaseous fuels and were all conducted with the same modular set of ACME hardware in the Combustion Integrated Rack (CIR). FLEX, FLEX-2, and the Cool Flames Investigation (CFI) each featured burning droplets of liquid fuel and were conducted with the Multi-user Droplet Combustion Apparatus (MDCA) in the CIR. BASS, BASS-II, the Smoke Point In Co-flow Experiment (SPICE), and the Structure & Liftoff In Combustion Experiment (SLICE) collectively featured both solid and gaseous fuels. Each of these investigations was conducted within the Microgravity Science Glovebox (MSG) using the modular fan-driven flow duct built for SPICE."),
    ("Spacesuits and oxygen concentration",
     "To enable flexibility, spacesuits are filled with 100% oxygen to only 4.3 psi (pounds per square inch), where the Earth's pressure at sea level is 14.7 psi. To avoid the bends (decompression sickness), the astronauts pre-breathe 100% oxygen to expel absorbed nitrogen. To reduce the pre-breathing duration and thus facilitate lunar excursions, it is expected that the Moon Base and pressurized rover(s) will be at a pressure and oxygen concentration between those in a spacesuit and the Earth's atmosphere. The intermediate oxygen concentration used on the Moon will likely be 30% or greater, with a corresponding pressure of 10.2 psi or less. Compared to Earth's atmosphere, that's more than a 40% increase in the oxygen concentration making materials much more flammable."),
    ("Highest oxygen concentrations tested",
     "Microgravity tests with the highest oxygen concentrations were conducted as part of the ACME's Cool Flames Investigation with Gases (CFI-G). In those tests, the combustion chamber was filled with a mixture of nitrogen and a flammable gas (e.g., propane), while an oxygen-nitrogen mixture of up to 85% oxygen flowed from the spherical burner creating an inside-out flame."),
    ("Partial-gravity data",
     "Although NASA is heavily focused on the return of astronauts to the Moon's surface and the establishment of a Moon Base in preparation for the future human exploration of Mars, there is currently no partial-gravity combustion data available in PSI. We expect such data will be added in the future, for example from the Lunar-g Combustion Investigation (LUCI) and the Flammability of Materials on the Moon (FM2) experiment. Partial gravity was mimicked in ACME's Electric-Field Effects on Laminar Diffusion Flames (E-FIELD Flames) experiment through the effect of the electric field on the ions that naturally occur in flames. Microgravity and normal-gravity results could bound what occurs at intermediate gravity levels."),
]
