require('dotenv').config();

const digitsOnly = (value) => String(value || '').replace(/[^0-9]/g, '');

const settings = {
  packname: 'ARCANIS BOT',
  author: '‎',
  botName: "ARCANIS BOT",
  aiMaxCharacters: 2000,
  botOwner: 'Entah', // Your name
  ownerNumber: digitsOnly(process.env.OWNER_NUMBER || ''), // Nomor WhatsApp owner (jangan dipakai sebagai nomor bot)
  botNumber: digitsOnly(process.env.BOT_NUMBER || ''), // Nomor WhatsApp akun BOT untuk pairing (kosong = bot tidak connect sampai diisi)
  giphyApiKey: process.env.GIPHY_API_KEY || '',
  commandMode: "public",
  maxStoreMessages: 20, 
  storeWriteInterval: 10000,
  description: "This is a bot for managing group commands and automating tasks.",
  version: "3.0.7",
  updateZipUrl: "", // Local-only updates
};

module.exports = settings;
