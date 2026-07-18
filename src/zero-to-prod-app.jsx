import React, { useState, useEffect } from 'react';

function ZeroToProdApp() {
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState('Ready to Hack!');

  useEffect(() => {
    // Hackathon logic goes here
    console.log('Hackathon app mounted!');
  }, []);

  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '40px',
      textAlign: 'center',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1>🚀 Hackathon MISTRAL Vibe</h1>
      <p style={{ fontSize: '1.5rem', margin: '20px 0' }}>
        {message}
      </p>
      <button 
        onClick={() => {
          setCount(c => c + 1);
          setMessage(`Clicked ${c + 1} times!`);
        }}
        style={{
          padding: '12px 24px',
          fontSize: '1.2rem',
          backgroundColor: '#6366f1',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer'
        }}
      >
        Hack It! ({count})
      </button>
    </div>
  );
}

export default ZeroToProdApp;
