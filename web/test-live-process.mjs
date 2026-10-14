const res = await fetch('https://automation.ninakurainservices.in/api/process', {
  method: 'POST',
  headers: {
    'x-nina-client': '1',
    'origin': 'https://automation.ninakurainservices.in'
  },
  body: JSON.stringify({})
});

console.log('Status:', res.status);
const data = await res.json();
console.log('Response:', data);
