const CONTRACT_ADDRESS = '0x9cf81A1814D452D4f5308aA38D128ce5CAADdDE4';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const CONTRACT_ABI = [
  {"inputs":[],"name":"generateReferralCode","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"referralCode","type":"uint256"}],"name":"depositFunds","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"deposits","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"currentAPR","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"requestWithdrawal","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"claimDepositReward","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"claimReferralReward","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"userReferrals","outputs":[{"internalType":"address","name":"referrer","type":"address"},{"internalType":"uint256","name":"referralCode","type":"uint256"},{"internalType":"bool","name":"exists","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"userAddress","type":"address"}],"name":"calculateReward","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"referralRewards","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
];

const USDC_ABI = [
  {
    "constant": false,
    "inputs": [
      {"name": "spender","type": "address"},
      {"name": "amount","type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"name": "","type": "bool"}],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {"name": "owner","type": "address"},
      {"name": "spender","type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"name": "","type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];

let web3;
let contract;
let usdcContract;
let currentAccount = '';

const state = {
  balance: '0',
  apr: '0',
  referralCode: '',
  withdrawRequested: false,
  depositReward: '0',
  referralReward: '0',
  isWalletConnected: false,
  referralStats: {
    totalReferrals: 0,
    referrerRate: 5,
    referredRate: 7
  }
};

async function getBaseGasPrice() {
  try {
    const gasPrice = await web3.eth.getGasPrice();
    return Math.max(Math.floor(Number(gasPrice) * 1.1), 100);
  } catch (error) {
    console.error('Gas price fetch error:', error);
    return '100';
  }
}

async function initContract() {
  web3 = new Web3(window.ethereum);
  contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
  usdcContract = new web3.eth.Contract(USDC_ABI, USDC_ADDRESS);
}

async function connectWallet() {
  try {
    if (typeof window.ethereum === 'undefined') {
      showAlert('Please install MetaMask to continue', 'error');
      return;
    }

    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      throw new Error('Wallet connection was denied');
    }

    currentAccount = accounts[0];
    state.isWalletConnected = true;
    await initContract();
    
    // Check and generate referral code
    const userReferral = await contract.methods.userReferrals(currentAccount).call();
    if (!userReferral.exists || userReferral.referralCode === '0') {
      showAlert('Generating your referral code...', 'info');
      const gasPrice = await getBaseGasPrice();
      const tx = await contract.methods.generateReferralCode()
        .send({ 
          from: currentAccount,
          gasPrice: gasPrice
        });
      
      if (tx.status) {
        const newUserReferral = await contract.methods.userReferrals(currentAccount).call();
        state.referralCode = newUserReferral.referralCode;
        showAlert('Your referral code has been generated!', 'success');
      }
    } else {
      state.referralCode = userReferral.referralCode;
    }
    
    await updateUI();
    showAlert('Wallet connected successfully', 'success');
  } catch (error) {
    console.error('Wallet connection error:', error);
    showAlert('Failed to connect wallet: ' + (error.message || 'An error occurred'), 'error');
    state.isWalletConnected = false;
    currentAccount = '';
  }
}

async function updateUI() {
  if (!currentAccount) return;

  try {
    const [balance, apr, depositReward, referralReward, userReferral] = await Promise.all([
      contract.methods.deposits(currentAccount).call(),
      contract.methods.currentAPR().call(),
      contract.methods.calculateReward(currentAccount).call(),
      contract.methods.referralRewards(currentAccount).call(),
      contract.methods.userReferrals(currentAccount).call()
    ]);

    // Update referral code
    if (userReferral.exists && userReferral.referralCode !== '0') {
      state.referralCode = userReferral.referralCode;
    }

    state = {
      ...state,
      balance: (balance / 1e6).toFixed(2),
      apr,
      depositReward: (depositReward / 1e6).toFixed(2),
      referralReward: (referralReward / 1e6).toFixed(2)
    };

    renderUI();
  } catch (error) {
    console.error('Update error:', error);
  }
}

async function handleDeposit() {
  if (!contract || !usdcContract) return;
  
  const amount = document.getElementById('depositAmount').value;
  if (!amount || amount <= 0) {
    showAlert('Please enter a valid amount', 'error');
    return;
  }

  const amountWei = web3.utils.toWei(amount, 'mwei');
  const gasPrice = await getBaseGasPrice();

  try {
    const allowance = await usdcContract.methods.allowance(currentAccount, CONTRACT_ADDRESS).call();
    
    if (BigInt(allowance) < BigInt(amountWei)) {
      showAlert('Approving USDC transfer...', 'info');
      const approveTx = await usdcContract.methods.approve(CONTRACT_ADDRESS, amountWei)
        .send({ 
          from: currentAccount,
          gasPrice: gasPrice
        });
      
      if (!approveTx.status) {
        throw new Error('USDC approval failed');
      }
    }

    showAlert('Processing deposit...', 'info');
    const depositTx = await contract.methods.depositFunds(amountWei, '0')
      .send({ 
        from: currentAccount,
        gasPrice: gasPrice
      });

    if (depositTx.status) {
      showAlert('Deposit completed successfully', 'success');
      await updateUI();
    } else {
      throw new Error('Deposit failed');
    }
  } catch (error) {
    console.error('Deposit error:', error);
    showAlert(error.message || 'Deposit failed', 'error');
  }
}

async function handleWithdrawRequest() {
  if (!contract) return;
  
  const amount = document.getElementById('withdrawAmount').value;
  if (!amount || amount <= 0) {
    showAlert('Please enter a valid amount', 'error');
    return;
  }

  const gasPrice = await getBaseGasPrice();
  
  try {
    await contract.methods.requestWithdrawal(web3.utils.toWei(amount, 'mwei'))
      .send({ 
        from: currentAccount,
        gasPrice: gasPrice
      });
    
    state.withdrawRequested = true;
    showAlert('Withdrawal request submitted', 'success');
    renderUI();
  } catch (error) {
    showAlert('Withdrawal request failed', 'error');
  }
}

async function handleWithdraw() {
  try {
    const gasPrice = await getBaseGasPrice();
    await contract.methods.withdraw()
      .send({ 
        from: currentAccount,
        gasPrice: gasPrice
      });
    state.withdrawRequested = false;
    showAlert('Withdrawal completed successfully', 'success');
    await updateUI();
  } catch (error) {
    showAlert('Withdrawal failed', 'error');
  }
}

async function handleClaimDepositReward() {
  try {
    const gasPrice = await getBaseGasPrice();
    await contract.methods.claimDepositReward()
      .send({ 
        from: currentAccount,
        gasPrice: gasPrice
      });
    showAlert('Deposit rewards claimed successfully', 'success');
    await updateUI();
  } catch (error) {
    showAlert('Failed to claim deposit rewards', 'error');
  }
}

async function handleClaimReferralReward() {
  try {
    const gasPrice = await getBaseGasPrice();
    await contract.methods.claimReferralReward()
      .send({ 
        from: currentAccount,
        gasPrice: gasPrice
      });
    showAlert('Referral rewards claimed successfully', 'success');
    await updateUI();
  } catch (error) {
    showAlert('Failed to claim referral rewards', 'error');
  }
}

async function copyReferralWithMessage() {
  const message = `Earn up to ${state.apr}% APR on your USDC with EarnUSDC on Base!
Use my referral code: ${state.referralCode}
${window.location.href}`;
  
  await navigator.clipboard.writeText(message);
  showAlert('Referral message copied to clipboard', 'success');
}

function showAlert(message
