require('dotenv').config();

const settings = {
  packname: 'ARCANIS BOT',
  author: '‎',
  botName: "ARCANIS BOT",
  aiMaxCharacters: 2000,
  botOwner: 'Entah', // Your name
  ownerNumber: '6285334900361', //Set your number here without + symbol, just add country code & number without any space
  giphyApiKey: process.env.GIPHY_API_KEY || '',
  commandMode: "public",
  maxStoreMessages: 20, 
  storeWriteInterval: 10000,
  description: "This is a bot for managing group commands and automating tasks.",
  version: "3.0.7",
  updateZipUrl: "", // Local-only updates
};

module.exports = settings;
