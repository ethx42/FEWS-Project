import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,           
  iterations: 1000,  
  duration: '30s',   
};

// Obtenemos la API KEY desde el comando de consola para no pegarla aquí
const API_KEY = __ENV.API_KEY;

if (!API_KEY) {
  throw new Error('ERROR: Debes pasar la API_KEY en el comando (k6 run -e API_KEY=...)');
}

// Generar placa de vehículo
function generateVehiclePlate() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const r = (str) => str.charAt(Math.floor(Math.random() * str.length));
  return `${r(letters)}${r(letters)}${r(letters)}-${r(numbers)}${r(numbers)}${r(numbers)}`;
}

// Función principal
export default function () {
  // 1. MEJORA: 5% de probabilidad de emergencia para asegurar correos
  const isEmergency = Math.random() < 0.05; 
  
  // 2. CORRECCIÓN: Estructura plana para que coincida con tu Lambda Node.js
  const payload = JSON.stringify({
    type: isEmergency ? 'Emergency' : 'Position',
    vehicle_plate: generateVehiclePlate(),
    // Coordenadas en la raíz, no en objeto anidado
    latitude: parseFloat((Math.random() * 180 - 90).toFixed(6)),
    longitude: parseFloat((Math.random() * 360 - 180).toFixed(6)),
    timestamp: new Date().toISOString(),
    status: 'OK',
  });

  // 3. AQUÍ VA LA API KEY
  const headers = { 
    'Content-Type': 'application/json',
    'x-api-key': API_KEY 
  };

  // Tu URL ya está puesta aquí
  const res = http.post('https://iyjdpkak5f.execute-api.us-east-1.amazonaws.com/prod/event', payload, { headers });

  // Logs reducidos para no saturar la consola (solo errores o emergencias)
  if (res.status !== 200 || isEmergency) {
     console.log(`Status: ${res.status} | Tipo: ${isEmergency ? 'Emergency' : 'Position'}`);
  }

  check(res, {
    'is status 200': (r) => r.status === 200,
  });

  sleep(0.03); // Pequeña pausa para no saturar tu red local
}