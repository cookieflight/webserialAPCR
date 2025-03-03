let device;
let portAPCR;
let portSN;
let reader;
let writer;
let samba;
let apcrproductNumber = "";
let keepreading;
let logElement = document.getElementById("flash-log");

import { ESPLoader, Transport } from "https://unpkg.com/esptool-js@0.5.4/bundle.js";


//document.getElementById("flash").addEventListener("click",findDeviceByVidPid); //performFlash);
//document.getElementById("flash-esp").addEventListener("click", flashESP);


//APCR
//VID: A380
//PID: F085
//

// ✅ Machine d'état
let updateState = "IDLE";

// ✅ Déclenchement du processus complet avec un seul bouton
document.getElementById("flash").addEventListener("click", () => {
    updateState = "IDLE";
    nextStep();
});

/*
document.getElementById("update").addEventListener("click", () => {
    updateState = "UPDATE_ESPTOOL";
    nextStep();
});*/

document.getElementById("check").addEventListener("click", () => {
     getAPCRsn();
});


const updateButton = document.getElementById("flash");
//const forceButton = document.getElementById("update");
updateButton.style.backgroundColor = "grey";
//forceButton.style.backgroundColor = "grey";

window.addEventListener("DOMContentLoaded", () => {
    if (!isWebSerialSupported()) {
        alert("❌ WebSerial API n'est pas supportée sur ce navigateur. Utilisez Google Chrome.");
    } else if (!isChromeBrowser()) {
        alert("⚠️ WebSerial fonctionne mieux sous Google Chrome.");
    } else {
        console.log("✅ WebSerial API disponible !");
    }
});

function isWebSerialSupported() {
    return "serial" in navigator;
}
function isChromeBrowser() {
    return /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
}



// ✅ Fonction pour passer à l'étape suivante
async function nextStep() {
    switch (updateState) {
        case "IDLE":
            log("🚀 Démarrage de l'update...");
            updateState = "UPDATE_STEP_1";
			updateProgress("progress-step-1", 0); 
			updateProgress("progress-esp", 0); 
			updateProgress("progress-step-3", 0); 

			await initflashbossa();
            break;

        case "UPDATE_STEP_1":
            log("✅ Étape 1 terminée. Passage à l'update ESP...");
            updateState = "UPDATE_ESPTOOL";
            await flashESP();
			updateButton.disabled = true;
            break;

        case "UPDATE_ESPTOOL":
            log("✅ Étape 2 terminée. Passage à l'update BOSSA finale...");
            updateState = "UPDATE_STEP_3";
			await initflashbossa();
            break;

        case "UPDATE_STEP_3":
            log("🎉 Mise à jour complète !");
            updateState = "IDLE";
			await sendNAMECommandsAndDisconnect();
			updateButton.disabled = false;
			window.prompt("Updated! Please unplug your device.");
            break;
    }
}


function updateProgress(barId, percent) {
    const bar = document.getElementById(barId);
    if (bar) {
        bar.style.width = percent + "%";
    }
}

async function forceUpdateWithSN(){
	
 let serialNumber = window.prompt("L'appareil est en mode bootloader. Veuillez entrer son numéro de série :", "");
					
					if (serialNumber && serialNumber.trim() !== "") {
						log(`✅ Numéro de série entré : ${serialNumber}`);
						apcrproductNumber = serialNumber;
						updateState = "UPDATE_ESPTOOL";
						nextStep();
	
					} else {
						log("❌ Aucun numéro de série saisi.");
						return null;
					}	
}




async function getAPCRsn(){
	log(`🟡 Demande de connexion ..`);
	closeSerialPort(portSN);
	
    try {
        
        
        portSN = await navigator.serial.requestPort();
			 const info = await portSN.getInfo();
			let targetPid = info.usbProductId;
			let targetVid = info.usbVendorId;
            console.log(`✅ Périphérique détecté (VID: ${targetVid}, PID: ${targetPid})`);
			
			
			if( targetVid === 0x239A && targetPid === 0x800B){
					await forceUpdateWithSN();
			}
            else if (targetPid === 0x000B) 
			{
				
				 log("In bootlader mode.. should reset");
				
				try {
					 log("samba connect");
					   samba = new SamBA(portSN);
						await samba.connect();
					//log("samba connect2");
						var dev = new Device(samba);
						await dev.create();
						await dev.reset();
						await sleep(1500);
					  log("reset device");
					  
					  
					   const info = await portSN.getInfo();
						let targetPid = info.usbProductId;
						let targetVid = info.usbVendorId;
						console.log(`✅ Périphérique détecté (VID: ${targetVid}, PID: ${targetPid})`);
						if (targetPid === 0x000B) 
						{
						await forceUpdateWithSN();
						}
						else 
							{
						console.log(`✅ Reset OK, click again CheckDevice`);
						}
				return;
				}
				  catch (err) {
					log("❌ Erreur de connexion : " + err);
					await forceUpdateWithSN();
				}
				// log("In bootlader mode.. should force update");
				//await forceUpdateWithSN()	
		
			}
			else
			{	  
		
		
		await closeSerialPort(portSN);
		
		 log("Connecting");
        // await portSN.open({ baudRate: 115200 }); // ✅ Utilisation du baudrate en argument
		await openSerialPort(portSN, 115200);  
        portAPCR = portSN;
        log("✅ Connexion réussie !");

				
		keepreading = true;		
		reader = portSN.readable.getReader();
        writer = portSN.writable.getWriter();
		
		startReading();
        startWriting();
		}
   
   
    } catch (err) {
        log("❌ Erreur de connexion : " + err);
    }
}


let serialBuffer = ""; // Buffer temporaire pour stocker les données incomplètes



async function startReading() {
    try {
        while (keepreading) {
			
			  if (!reader) {
                console.warn("⚠️ Pas de lecteur disponible !");
                return;
            }


            const { value, done } = await reader.read();
            if (done) break;

            const text = new TextDecoder().decode(value);
            serialBuffer += text; // 🔥 Ajouter les nouvelles données au buffer
            
            // Vérifier si la trame est complète (ex: fin par `|` ou `\n`)
            if (serialBuffer.includes("\n")) {
                processSerialData(serialBuffer);
                serialBuffer = ""; // 🔥 Réinitialiser le buffer après traitement
            }
        }
    } catch (err) {
        log("❌ Erreur de lecture : " + err);
    }
}

function processSerialData(data) {
  
  //log("📥 Trame complète reçue : " + data);

    const parts = data.split("|");
    if (parts.length >= 5) {
        const serialNumber = parts[4]; // 🔥 Extraire la valeur
		 apcrproductNumber = parts[1]; // 🔥 `APCR-2904`
        if (isValidSerialNumber(serialNumber) && isValidProduct(apcrproductNumber)) {
            log(`✅ Numéro de série valide : ${serialNumber} pour  ${apcrproductNumber}` );
			 updateButton.hidden = false;
			 updateButton.disabled = false;
			 updateButton.textContent = "OK update to 1.5.21"
			 updateButton.style.backgroundColor = "blue";
        } else {
           // log(`❌ Numéro de série invalide : ${serialNumber}`);
        }
    } else {
       // log("⚠️ Trame incomplète, impossible d'extraire le numéro de série.");
    }
}

function isValidProduct(pn) {
	
    return /^APCR/.test(pn);

}

function isValidSerialNumber(serial) {
    const regex = /^1\.5\.(\d{2})$/; // 🔍 Vérifie le format "1.5.XX"
    const match = serial.match(regex);

    if (match) {
        const xx = parseInt(match[1], 10); // 🔥 Extraire XX et convertir en nombre
        return xx >= 10 && xx <= 30; // ✅ Vérifier si XX est entre 10 et 30
    }
    
    return false; // ❌ Mauvais format
}


// ✅ Envoi d'une commande toutes les 5 secondes
async function startWriting() {
    try {
        while (keepreading) {
			
			 if (!writer) {
                console.warn("⚠️ Pas d'écrivain disponible !");
                return;
            }
			
            await writer.write(new TextEncoder().encode("#?\n"));
            //log("📤 PING envoyé");
            await sleep(2000); // 🔥 Attente 5s avant le prochain envoi
        }
    } catch (err) {
        log("❌ Erreur d'écriture : " + err);
    }
}







async function openSerialPort(port, baudRate = 115200) {
    if (!port) {
        console.warn("⚠️ Aucun port disponible !");
        return null;
    }

    try {
        if (port.readable || port.writable) {
            console.log("⚠️ Port déjà ouvert !");
            return port;  // Retourne le port s'il est déjà ouvert
        }

        console.log(`🔌 Ouverture du port avec baudrate: ${baudRate}...`);
        await port.open({ baudRate });

        console.log("✅ Port série ouvert !");
        return port;
    } catch (err) {
        console.error("❌ Erreur lors de l'ouverture du port :", err);
        return null;
    }
}



async function closeSerialPort(port) {
    if (!port) {
        console.warn("⚠️ Aucun port à fermer !");
        return;
    }

    try {
	
	 if (port.readable || port.writable) { 
			if (reader) {
				console.log("📌 Libération du lecteur...");
				await reader.cancel(); // 🔥 Annuler la lecture active
				reader.releaseLock();  // 🔓 Libérer le lecteur
			}

			if (writer) {
				console.log("📌 Libération de l'écrivain...");
				writer.releaseLock();  // 🔓 Libérer l'écrivain
			}
	
			console.log("🔌 Fermeture du port...");
			await port.close(); // 🔥 Fermer proprement
			console.log("✅ Port série fermé !");
		
		}
		else {
			console.log("✅ Port série déjà fermé !");
			}
    } catch (err) {
        console.error("❌ Erreur lors de la fermeture du port :", err);
    }
}












async function sendNAMECommandsAndDisconnect() {
	  console.log("✅ sendNAMECommandsAndDisconnect");
	  
	  /*
	  try {
		console.log("🔌 Fermeture du port...");
        await portAPCR.close(); // 🔥 Fermer proprement
        console.log("✅ Port série fermé !");
    } catch (err) {
        console.error("❌ Erreur lors de la fermeture du port :", err);
    }*/
	
	  
	  	await closeSerialPort(portAPCR);
		await sleep(500);
		
    try {
   
    const ports = await navigator.serial.getPorts();
   
    for (const port of ports) {
        const info = await port.getInfo();
       // console.log(info.usbVendorId);
        if (info.usbVendorId === 0x239A || info.usbVendorId === 0xA380) {
			portAPCR = port
			}
			}
	
        //await portAPCR.open({ baudRate: 115200 });
		await openSerialPort(portAPCR, 115200);
        console.log("✅ Port série connecté !");
        
        const writer = portAPCR.writable.getWriter(); // ✅ Ouvre un flux d'écriture
        
		if (apcrproductNumber === "" ){apcrproductNumber = "APCR-0011";}
		//const cm = "$S".join(apcrproductNumber);
       
          const commands = [
            `$S${apcrproductNumber}\n`,
            `$S${apcrproductNumber}\n`,
            `$S${apcrproductNumber}\n`
        ];
        for (const cmd of commands) {
            console.log(`📤 Envoi :  ${apcrproductNumber}`);
            await writer.write(new TextEncoder().encode(cmd));
            await sleep(1000); // ⏳ Pause de 500ms entre chaque commande
        }
        
        writer.releaseLock(); // ✅ Libère l'écriture
        await portAPCR.close(); // ✅ Ferme le port proprement
        console.log("🔌 Port série fermé !");
		
    } catch (err) {
        console.error("❌ Erreur série :", err);
    }
}



//////////////////////////////////////////////////////////////////

async function initflashbossa() {
 
 
   //let tempport =  await navigator.serial.requestPort();
	keepreading = false;
    try {
        await closeSerialPort(portSN);
    } catch (err) {
		log(err)
        }
	  try {
        await closeSerialPort(portAPCR);
    } catch (err) {
		log(err)
        }	

 // console.log( await navigator.serial.getPorts() );
   const ports = await navigator.serial.getPorts();
   
    for (const port of ports) {
        const info = await port.getInfo();
       // console.log(info.usbVendorId);
        if (info.usbVendorId === 0x239A || info.usbVendorId === 0xA380) {
           let targetVid = info.usbVendorId;
            let targetPid = info.usbProductId;
            console.log(`✅ Périphérique détecté (VID: ${targetVid}, PID: ${targetPid})`);
            if (targetPid !== 0x000B) {
                log("🔄 Passage en mode bootloader...");
                
                try {
                    //await port.open({ baudRate: 1200 });
					await openSerialPort(port, 1200); 
                    await sleep(100);
                    await port.close();
                    log("✅ Port fermé, attente du reboot...");
                } catch (err) {
                    log("❌ Erreur en mode bootloader : " + err);
                    return;
                }
                
                // 🔥 Attendre 2s que le périphérique redémarre
					await sleep(2000);

                // 🔄 Relancer la détection après le reboot
                log("🔍 Nouvelle tentative de détection du bootloader...");
                await initflashbossa();
                return;
            } else {
                log("✅ L'appareil est déjà en mode bootloader !");
                await performFlashBossa();
                return;
            }

            
        }
    }
    console.log("❌ Aucun périphérique trouvé.");

}




  navigator.serial.addEventListener("connect", async (event) => {
    console.log("🔌 Appareil connecté :", event.target);
    const info = await event.target.getInfo();
    console.log(`📍 Détecté : VID ${info.usbVendorId}, PID ${info.usbProductId}`);
    
	
		portAPCR = await openSerialPort(event.target, 115200);  
   
		   
	   // Vérifier si l'ouverture du port a réussi avant d'accéder à readable / writable
		if (!portAPCR) {
			console.error("❌ Impossible d'ouvrir le port !");
			return;
		}
		
		 log("✅ Connexion réussie !");
		keepreading = true;		
		reader = portAPCR.readable.getReader();
        writer = portAPCR.writable.getWriter();
		
		startReading();
        startWriting();

});




navigator.serial.addEventListener("disconnect", (event) => {
    console.log("❌ Appareil déconnecté :", event.target);
	updateButton.hidden = true;
});



async function performFlashBossa() {
 
  

    const ports = await navigator.serial.getPorts();
    for (const port of ports) {
        const info = await port.getInfo();
        console.log(info.usbVendorId);
            if (info.usbVendorId === 0x239A || info.usbVendorId === 0xA380)// && info.usbProductId === 0x000B) 
            {
                portAPCR = port;
                break;
            }
        }

        if (portAPCR.readable || portAPCR.writable) { 

        try {
            log(" fermeture port.. ");
            await portAPCR.close();
        } catch (err) {
           // log(" fermeture port non valide: " + err);
            }

            }

            const apcrinfo = await portAPCR.getInfo();
            if (apcrinfo.usbProductId === 0x000B)// && info.usbProductId === 0x000B) 
            {
                log("⚡ Bien en bootloader mode...");
            }
		else {
            log("⚡ PAS en bootloader mode...");
            initflashbossa();
            return
        }

    log("⚡ Initialisation de SamBA...");
    samba = new SamBA(portAPCR);

    try {
        await samba.connect();
        log("✅ SamBA connecté !");

        // 🔥 Obtenir les infos du device
        //device = await samba.getDevice();
		var dev = new Device(samba);
	    await dev.create();
		device = dev;
		console.log("🔍 Device complet :", device);
		
		     // ✅ Vérification si `device.flash` est bien défini
        if (!device.flash) {
            log("❌ Erreur : device.flash est undefined !");
            return;
        }

        // Charger le firmware
        let response = await fetch("passthroughESP32-115200.bin");
		
		if(updateState  === "UPDATE_STEP_1"){
			response = await fetch("passthroughESP32-115200.bin");
			log("fetch passthroughESP32 firmware");
			}
			else if (updateState  === "UPDATE_STEP_3"){
			
			log("fetch APC-R_firmware_1.5.21 firmware");
			response = await fetch("APC-R_firmware_1.5.21.bin");
			}
			
		
        const firmware = new Uint8Array(await response.arrayBuffer());

        let success = await flashImage(firmware);

        if (success && device) {
            try {
                await sleep(300)
                await device.reset();
                await sleep(300)
               // await device.reset();
                log("🔄 Device redémarré !");
				//log("🔄going ESP");
				await sleep(1500)
				  nextStep();
				
            } catch (err) {
                log("❌ Erreur lors du redémarrage : " + err);
            }
        }
    } catch (err) {
        log("❌ Erreur lors de la connexion SamBA : " + err);
		//deconnectSerial();
        try {
            await portAPCR.close();
        } catch (err) {
            log(" fermeture port non valide: " + err);
            }
    }
}

async function flashImage(data) {
    if (!device || !samba || !device.flash) {
        log("❌ Erreur : Device ou flash non disponible !");
        return false;
    }

    try {
        log("⚡ Flash du firmware en cours...");
		 let totalPages = Math.ceil(data.length / device.flash.pageSize); // ✅ Calcul du nombre de pages
        const observer = new MyFlasherObserver(totalPages);
        const flasher = new Flasher(samba, device.flash, observer);
        let offset = 0x00002000;

        await flasher.erase(offset);
        log("🧹 Mémoire effacée !");

        await flasher.write(data, offset);
        log("✅ Firmware écrit avec succès !");
        
        return true;
    } catch (error) {
        log("❌ Erreur de flashage : " + error);
        return false;
    }
}

class MyFlasherObserver {
	
	  constructor(totalPages) {
        this.totalPages = totalPages;
    }
	
    onStatus(message) {
        log(`🔄 Flash status: ${message}`);
    }

      onProgress(value) {
        let percent = Math.round((value / this.totalPages) * 100); // ✅ Convertir en %
        console.log(`📊 Pages écrites: ${value}/${this.totalPages} (${percent}%)`);
        log(`📊 Progression : ${percent}%`);
		
		if(updateState  === "UPDATE_STEP_1"){
			updateProgress("progress-step-1", percent); // ✅ Mise à jour de la barre BOSSA
		}
		else if (updateState  === "UPDATE_STEP_3"){
		  updateProgress("progress-step-3", percent); // ✅ Mise à jour de la barre BOSSA
		}
		
		
		
		
    }
}



async function flashESP() {
    let device = null;
    let transport = null;
    let esploader = null;

updateProgress("progress-esp", 0); // ✅ Réinitialiser la barre ESPTool



   const ports = await navigator.serial.getPorts();
    for (const port of ports) {
        const info = await port.getInfo();
        console.log(info.usbVendorId);
            if (info.usbVendorId === 0x239A)// && info.usbProductId === 0x000B) 
            {
                portAPCR = port;
                break;
            }
        }


  if (portAPCR.readable || portAPCR.writable) { 

        try {
            log(" fermeture port.. ");
            await portAPCR.close();
			sleep(50)
        } catch (err) {
           // log(" fermeture port non valide: " + err);
            }

            }

//await exitBootloader();

    try {
       // log("🟡 Sélection du port série...");
       // device = await navigator.serial.requestPort();
       // transport = new Transport(device, true); // ✅ Utilisation du `Transport` comme Adafruit
		
		
		transport = new Transport(portAPCR, true); // ✅ Utilisation du `Transport` comme Adafruit
	
		log("⚡ Initialisation d'ESPTool...");
        esploader = new ESPLoader({
            transport: transport,
            baudrate: 115200,
            terminal:  espLoaderTerminal ,
			debugLogging: false,
        });
		
		   
           let resetMode = "no_reset";
            try {
                // Initiate passthrough serial setup
                await transport.connect(romBaudrate);
                await transport.disconnect();
                await sleep(350);
            } catch (e) {
            }
        
        // ✅ Initialisation correcte via `main()`
        const chip = await esploader.main(resetMode);
        log(`✅ ESP détecté : ${chip}`);
        
        // 🔥 Charger le firmware
        const response = await fetch("NINA_W102-2.0.0.rc.bin");
		const firmwareBlob = await response.blob(); // ✅ Convertir en Blob
		const firmwareString = await readUploadedFileAsBinaryString(firmwareBlob); // ✅ Convertir en `BinaryString`

        //const firmware = new Uint8Array(await response.arrayBuffer());
        log(`📂 Firmware ESP chargé : ${firmwareString.length} octets`);




        // ⚡ Flash du firmware
        await esploader.writeFlash({
            fileArray: [{ data: firmwareString, address: 0x0 }],
            flashSize: "keep",
            eraseAll: false,
            compress: true,
            reportProgress: (fileIndex, written, total) => {
                let percent = Math.floor((written / total) * 100);
                log(`📊 Progression : ${percent}%`);
				 updateProgress("progress-esp", percent); // ✅ Mise à jour de la barre ESPTool
            },
        });

        log("✅ Flash ESP terminé !");
     
	  try {
		 if (transport) {
            await transport.disconnect();
        }
		 if (device) {
            await device.close();
        }
		    
		} catch (err) {
        log("❌ Erreur : " + err.message);
		} 
		
		  nextStep();
		//await esploader.disconnect(); // ✅ Utilisation correcte
		log("🔄 ESP déconnecté !");

        log("🔄 ESP redémarré !");
        
    } catch (err) {
        log("❌ Erreur : " + err.message);
    } finally {
        if (transport) {
            await transport.disconnect();
        }
        if (device) {
            await device.close();
        }
        log("🔌 Port série fermé.");
    }
}


async function readUploadedFileAsBinaryString(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onerror = () => {
            reader.abort();
            reject(new DOMException("Erreur lors de la lecture du fichier."));
        };

        reader.onload = () => {
            resolve(reader.result);
        };

        reader.readAsBinaryString(file); // ✅ Convertit en `BinaryString`
    });
}



const espLoaderTerminal = {
    clean() {
        log.innerHTML = "";
    },
    writeLine(data) {
        log(data);
    },
    write(data) {
        log(data);
    },
};

// ✅ Fonction `sleep()` corrigée
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Fonction pour afficher les logs
function log(message) {
    logElement.textContent += message + "\n";
    logElement.scrollTop = logElement.scrollHeight; // ✅ Auto-scroll vers le bas
}
