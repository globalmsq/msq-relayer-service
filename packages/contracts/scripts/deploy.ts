import { ethers, network, run } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("MSQ Relayer Contracts Deployment");
  console.log("=".repeat(60));
  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${network.config.chainId}`);
  console.log(`Deployer: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  console.log("=".repeat(60));

  // Example deployment - uncomment and modify when you have contracts
  // const Contract = await ethers.getContractFactory("YourContract");
  // const contract = await Contract.deploy();
  // await contract.waitForDeployment();
  // const contractAddress = await contract.getAddress();
  // console.log(`Contract deployed to: ${contractAddress}`);

  // Verify on Polygonscan (only for testnets/mainnet)
  // if (network.name === "amoy") {
  //   console.log("Waiting for block confirmations...");
  //   await contract.deploymentTransaction()?.wait(5);
  //   console.log("Verifying contract on Polygonscan...");
  //   await run("verify:verify", {
  //     address: contractAddress,
  //     constructorArguments: [],
  //   });
  //   console.log("Contract verified!");
  // }

  console.log("\nDeployment completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
