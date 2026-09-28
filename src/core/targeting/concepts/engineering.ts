import type { ConceptPack } from './types';

export const SOFTWARE_CS_PACK: ConceptPack = { id:'software-cs', label:'Software / Computer Science', concepts:[
 {id:'algorithms-ds',label:'Algorithms & Data Structures',category:'software',patterns:['algorithms','data structures','algorithm design','complexity analysis'],supporting:['problem solving','optimization']},
 {id:'backend',label:'Backend / API Development',category:'software',patterns:['backend development','rest api','restful api','microservices','server-side','server side'],supporting:['api','http','json']},
 {id:'frontend',label:'Frontend Development',category:'software',patterns:['frontend development','front-end development','react','angular','vue','responsive web'],supporting:['javascript','typescript','html','css']},
 {id:'oop',label:'Object-Oriented Programming',category:'software',patterns:['object oriented programming','object-oriented programming','oop'],supporting:['classes','design patterns']},
 {id:'testing-software',label:'Software Testing',category:'software',patterns:['unit testing','integration testing','automated testing','test automation','software testing'],supporting:['test cases','regression testing']},
 {id:'distributed',label:'Distributed Systems',category:'software',patterns:['distributed systems','distributed computing','concurrency','multithreading'],supporting:['scalability','fault tolerance']},
]};

export const COMPUTER_ENGINEERING_PACK: ConceptPack = { id:'computer-engineering', label:'Computer Engineering', concepts:[
 {id:'embedded',label:'Embedded Systems / Firmware',category:'engineering',patterns:['embedded systems','embedded software','firmware','bare metal','bare-metal'],supporting:['microcontroller','real-time']},
 {id:'mcu',label:'Microcontrollers',category:'engineering',patterns:['microcontroller','mcu','esp32','stm32','arm cortex','pic microcontroller'],supporting:['firmware','embedded']},
 {id:'digital-logic',label:'Digital Logic / RTL',category:'engineering',patterns:['digital logic','rtl','verilog','vhdl','fpga'],supporting:['finite state machine','fsm','logic design']},
 {id:'hw-interfaces',label:'Hardware Interfaces',category:'engineering',patterns:['uart','spi','i2c','can bus','gpio','serial communication'],supporting:['communication protocol','peripheral']},
 {id:'board-bringup',label:'Board Bring-up / Hardware Debug',category:'engineering',patterns:['board bring-up','board bringup','hardware debugging','logic analyzer','oscilloscope','jtag'],supporting:['debugging','pcb']},
 {id:'rtos',label:'RTOS / Real-Time Systems',category:'engineering',patterns:['rtos','real-time operating system','real time operating system','freertos'],supporting:['tasks','interrupts','scheduling']},
]};

export const ELECTRICAL_ENGINEERING_PACK: ConceptPack = { id:'electrical-engineering', label:'Electrical Engineering', concepts:[
 {id:'circuit-design',label:'Circuit Design & Analysis',category:'engineering',patterns:['circuit design','circuit analysis','analog circuits','digital circuits'],supporting:['schematic','electronics']},
 {id:'pcb',label:'PCB Design',category:'engineering',patterns:['pcb design','printed circuit board','altium','kicad','orcad'],supporting:['schematic capture','layout']},
 {id:'power-systems',label:'Power Systems',category:'engineering',patterns:['power systems','power system analysis','load flow','power flow','short circuit analysis','protective relaying'],supporting:['generation','transmission','distribution']},
 {id:'controls',label:'Controls / Control Systems',category:'engineering',patterns:['control systems','control system','pid control','feedback control','state space'],supporting:['matlab','simulink']},
 {id:'signal-processing',label:'Signal Processing',category:'engineering',patterns:['signal processing','digital signal processing','dsp','filter design','fft'],supporting:['signals','sampling']},
 {id:'instrumentation',label:'Instrumentation & Measurement',category:'engineering',patterns:['instrumentation','data acquisition','daq','sensor instrumentation'],supporting:['measurement','calibration']},
]};

export const MECHANICAL_ENGINEERING_PACK: ConceptPack = { id:'mechanical-engineering', label:'Mechanical Engineering', concepts:[
 {id:'cad-me',label:'Mechanical CAD',category:'engineering',patterns:['solidworks','autocad','creo','catia','inventor','mechanical cad'],supporting:['3d modeling','engineering drawings']},
 {id:'gdandt',label:'GD&T / Engineering Drawings',category:'engineering',patterns:['gd&t','geometric dimensioning and tolerancing','engineering drawings','technical drawings'],supporting:['tolerances','dimensioning']},
 {id:'fea',label:'Finite Element Analysis',category:'engineering',patterns:['finite element analysis','fea','ansys','abaqus'],supporting:['stress analysis','structural analysis']},
 {id:'cfd',label:'Computational Fluid Dynamics',category:'engineering',patterns:['computational fluid dynamics','cfd','fluent'],supporting:['fluid mechanics','simulation']},
 {id:'thermo',label:'Thermal / Thermodynamics',category:'engineering',patterns:['thermodynamics','heat transfer','thermal analysis'],supporting:['energy balance','thermal']},
 {id:'mechanical-design',label:'Mechanical Design',category:'engineering',patterns:['mechanical design','machine design','design for manufacturing','dfm','dfa'],supporting:['prototype','tolerance analysis']},
]};

export const BIOMEDICAL_ENGINEERING_PACK: ConceptPack = { id:'biomedical-engineering', label:'Biomedical Engineering', concepts:[
 {id:'medical-devices',label:'Medical Devices',category:'engineering',patterns:['medical device','medical devices','biomedical device'],supporting:['device design','healthcare technology']},
 {id:'biomedical-signals',label:'Biomedical Signals',category:'engineering',patterns:['biomedical signal','ecg','eeg','emg','biosignal'],supporting:['signal processing','sensors']},
 {id:'biocompatibility',label:'Biocompatibility / Biomaterials',category:'engineering',patterns:['biocompatibility','biomaterials','biomaterial'],supporting:['materials','implant']},
 {id:'medical-regulatory',label:'Medical Device Quality / Regulatory',category:'engineering',patterns:['iso 13485','fda medical device','medical device regulations','design controls'],supporting:['risk management','verification','validation']},
]};

export const CIVIL_ENGINEERING_PACK: ConceptPack = { id:'civil-engineering', label:'Civil Engineering', concepts:[
 {id:'structural',label:'Structural Engineering',category:'engineering',patterns:['structural engineering','structural analysis','steel design','concrete design'],supporting:['loads','structures']},
 {id:'geotechnical',label:'Geotechnical Engineering',category:'engineering',patterns:['geotechnical','soil mechanics','foundation design'],supporting:['soil','foundations']},
 {id:'transportation',label:'Transportation Engineering',category:'engineering',patterns:['transportation engineering','traffic engineering','road design','highway design'],supporting:['traffic','transportation']},
 {id:'civil-cad',label:'Civil CAD / GIS',category:'engineering',patterns:['civil 3d','autocad civil 3d','gis','arcgis'],supporting:['survey','mapping']},
]};

export const INDUSTRIAL_ENGINEERING_PACK: ConceptPack = { id:'industrial-engineering', label:'Industrial Engineering', concepts:[
 {id:'operations-research',label:'Operations Research / Optimization',category:'engineering',patterns:['operations research','linear programming','integer programming','optimization modeling'],supporting:['optimization','simulation']},
 {id:'process-engineering',label:'Process / Methods Engineering',category:'engineering',patterns:['process engineering','methods engineering','work measurement','time study'],supporting:['process improvement','workflow']},
 {id:'ergonomics',label:'Ergonomics / Human Factors',category:'engineering',patterns:['ergonomics','human factors','workplace ergonomics'],supporting:['safety','workstation']},
]};

export const CHEMICAL_ENGINEERING_PACK: ConceptPack = { id:'chemical-engineering', label:'Chemical Engineering', concepts:[
 {id:'process-design-chem',label:'Chemical Process Design',category:'engineering',patterns:['process design','process simulation','aspen hysys','aspen plus','pfd','p&id'],supporting:['unit operations','mass balance']},
 {id:'mass-energy',label:'Mass & Energy Balances',category:'engineering',patterns:['mass balance','material balance','energy balance'],supporting:['process calculations','thermodynamics']},
 {id:'reaction-engineering',label:'Reaction Engineering',category:'engineering',patterns:['reaction engineering','chemical kinetics','reactor design'],supporting:['kinetics','reactor']},
 {id:'process-safety',label:'Process Safety',category:'engineering',patterns:['process safety','hazop','process hazard analysis','pha'],supporting:['risk assessment','chemical safety']},
]};
