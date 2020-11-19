import express from 'express';
import path from 'path';
import fs, { write } from 'fs';
import { BlockHeader, createApi, decodeHeader, encodeHeader, generateDAG, getProof } from './utils';
import Web3 from 'web3';
import { Logger } from "tslog";
import { ApiPromise } from '@polkadot/api';

const log: Logger = new Logger();
const app = express();
const port = 8080;

export const PROVIDER_URL = process.env.ETH_PROVIDER_URL || 'https://mainnet.infura.io/v3/b5f870422ee5454fb11937e947154cd2';
// 10 minute default polling delay
export const POLLING_DELAY = Number(process.env.POLLING_DELAY) || 1000 * 60 * 10;
export const EPOCH_BLOCK_LENGTH = Number(process.env.EPOCH_BLOCK_LENGTH) || 30000;
export const LOCAL_DB_PATH = process.env.LOCAL_DB_PATH || './database.json';
export const ETHASH_PROOF_DIR = process.env.ETHASH_PROOF_DIR || '/Users/drewstone/code/commonwealth/ethashproof';

interface Database {
  currentEpoch: number;
  lastBlockNumber: number;
  proofs: any;
}

export const writeToDatabase = (d: Database) => {
  fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(d, null, 4));
};

export const readFromDatabase = () => {
  if (fs.existsSync(LOCAL_DB_PATH)) {
    const data = fs.readFileSync(LOCAL_DB_PATH);
    return JSON.parse(data.toString());
  }
  return {
    currentEpoch: 0,
    lastBlockNumber: 0,
    proofs: {},
  };
};

const database: Database = readFromDatabase();

app.post('/proof', async (req, res) => {
  let proof = {};
  res.send({ proof });
});

app.listen(port, async () => {
  let isGenerating = false;
  log.info(`server started at http://localhost:${ port }`);
  const web3 = new Web3(PROVIDER_URL);
  const blockNumber = Number(await web3.eth.getBlockNumber());
  log.info(`Current block: ${Number(await web3.eth.getBlockNumber())}`);
  setInterval(async () => {
    const blockNumber = Number(await web3.eth.getBlockNumber());
    const epoch = Number((Number(blockNumber) / EPOCH_BLOCK_LENGTH).toFixed(0));
    database.currentEpoch = epoch;
    database.lastBlockNumber = blockNumber;
    const nextEpoch = epoch + 1;
    const nextEpochBlock = nextEpoch * EPOCH_BLOCK_LENGTH;
    // choose to generate the next DAG when we are halfway
    if (nextEpochBlock - blockNumber < EPOCH_BLOCK_LENGTH / 2 && !isGenerating) {
      isGenerating = true;
      generateDAG(nextEpoch, () => {
        isGenerating = false;
      });
    } else {
      log.info(`block: ${blockNumber}, epoch ${epoch}, next epoch block ${nextEpochBlock}`);
    }
  // tslint:disable-next-line: align
  }, POLLING_DELAY);

  let num = blockNumber;
  const fn = async () => {
    const latest = Number(await web3.eth.getBlockNumber());
    if (num > latest) {
      return;
    }

    if (num % 10 === 0) {
      writeToDatabase(database);
    }

    if (num in database.proofs) {
      // do nothing
    } else {
      database.proofs[num] = {};
      const block: any = await web3.eth.getBlock(num);
      if (block) {
        const blockHeader: BlockHeader = {
          parentHash: block.parentHash,
          unclesHash: block.sha3Uncles,
          author: block.miner,
          stateRoot: block.stateRoot,
          transactionsRoot: block.transactionsRoot,
          receiptsRoot: block.receiptsRoot,
          logBloom:  block.logsBloom,
          difficulty:  block.difficulty,
          number: block.number,
          gasLimit: block.gasLimit,
          gasUsed: block.gasUsed,
          timestamp: block.timestamp,
          extraData: block.extraData,
          mixHash: block.mixHash,
          nonce: block.nonce,
        };
        const encoded = encodeHeader(blockHeader);
        const proof = await getProof(`0x${Buffer.from(encoded).toString('hex')}`);
        database.proofs[num] = proof;
        num += 1;
      }
    }
  }

  setInterval(fn, 3000);
});
