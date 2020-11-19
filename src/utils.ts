import { exec } from 'child_process';
import { POLLING_DELAY, ETHASH_PROOF_DIR } from '.';
import web3 from 'web3';
import { Logger } from "tslog";
import { ApiPromise, WsProvider } from '@polkadot/api';
import { RegisteredTypes } from '@polkadot/types/types';
import { TypeRegistry } from '@polkadot/types';

const utils = require('ethereumjs-util');

const log: Logger = new Logger();

/**
 * Attempts to open an API connection, retrying if it cannot be opened.
 * @param url websocket endpoing to connect to, including ws[s]:// and port
 * @returns a promise resolving to an ApiPromise once the connection has been established
 */
export async function createApi(
  url: string, typeOverrides: RegisteredTypes = {},
): Promise<ApiPromise> {
  // construct provider
  const provider = new WsProvider(url);
  let unsubscribe: () => void;
  await new Promise((resolve) => {
    unsubscribe = provider.on('connected', () => resolve());
  });
  if (unsubscribe) unsubscribe();

  // construct API using provider
  const registry = new TypeRegistry();
  const api = new ApiPromise({
    provider,
    registry,
    ...typeOverrides
  });
  return api.isReady;
}

const ethashproof = (command: string) => {
  return new Promise(resolve =>
    exec(command, (error, stdout, stderr) => {
      if (error) {
        log.error(error);
      }
      resolve(stdout);
    }),
  );
};

export const getProof = async (rlpHeader: string) => {
  try {
    const block = decodeHeader(rlpHeader);
    log.info(`Generating the proof for block: ${block.number}`);
    log.debug(`Processing proof for RLP header: ${rlpHeader}`);
    const unparsedBlock: any = await ethashproof(
      `${ETHASH_PROOF_DIR}/cmd/relayer/relayer ${rlpHeader} | sed -e '1,/Json output/d'`,
    )
    return JSON.parse(unparsedBlock);
  } catch (e) {
    log.error(`Failed to get or parse block: ${e}`);
  }
};

export const generateDAG = (epoch: Number, callback: any) => {
  const handleResponse = (error: any, stdout: any, stderr: any) => {
    if (error) {
      log.error(error.stack);
      log.error(`Error code: ${error.code}`);
      log.error(`Signal received: ${error.signal}`);
    }
    log.info(`Child Process STDOUT: ${stdout}`);
    log.info(`Child Process STDERR: ${stderr}`);
  }
  const dagExec = exec(`${ETHASH_PROOF_DIR}/cmd/epoch/epoch ${epoch}`, handleResponse);

  dagExec.on('exit', callback());

  dagExec.on('data', log.debug);
};

export interface BlockHeader {
  parentHash: string;
  unclesHash: string;
  author: string;
  stateRoot: string;
  transactionsRoot: string;
  receiptsRoot: string;
  logBloom:  string;
  difficulty:  string;
  number: string;
  gasLimit: string;
  gasUsed: string;
  timestamp: string;
  extraData: string;
  mixHash: string;
  nonce: string;
}

function hexToBytes(hex: string) {
  for (var bytes = [], c = 0; c < hex.length; c += 2)
  bytes.push(parseInt(hex.substr(c, 2), 16));
  return bytes;
}

export const decodeHeader = (encoded: string): BlockHeader => {
  const decoded = utils.rlp.decode(encoded);
  const b: BlockHeader = {
    parentHash: `0x${decoded[0].toString('hex')}`,
    unclesHash: `0x${decoded[1].toString('hex')}`,
    author: `0x${decoded[2].toString('hex')}`,
    stateRoot: `0x${decoded[3].toString('hex')}`,
    transactionsRoot: `0x${decoded[4].toString('hex')}`,
    receiptsRoot: `0x${decoded[5].toString('hex')}`,
    logBloom:  `0x${decoded[6].toString('hex')}`,
    difficulty: web3.utils.toBN(`0x${decoded[7].toString('hex')}`).toString(),
    number: web3.utils.toBN(`0x${decoded[8].toString('hex')}`).toString(),
    gasLimit: web3.utils.toBN(`0x${decoded[9].toString('hex')}`).toString(),
    gasUsed: web3.utils.toBN(`0x${decoded[10].toString('hex')}`).toString(),
    timestamp: web3.utils.toBN(`0x${decoded[11].toString('hex')}`).toString(),
    extraData: `0x${decoded[12].toString('hex')}`,
    mixHash: `0x${decoded[13].toString('hex')}`,
    nonce:`0x${decoded[14].toString('hex')}`,
  };

  return b;
};

export const encodeHeader = (header: BlockHeader): string => {
  let difficulty = (web3.utils.toBN(header.difficulty).toString('hex'));
  if (difficulty.length % 2 !== 0) {
    difficulty = `0${difficulty}`;
  }

  const data = [
    Buffer.from(hexToBytes(header.parentHash.slice(2))),
    Buffer.from(hexToBytes(header.unclesHash.slice(2))),
    Buffer.from(hexToBytes(header.author.slice(2))),
    Buffer.from(hexToBytes(header.stateRoot.slice(2))),
    Buffer.from(hexToBytes(header.transactionsRoot.slice(2))),
    Buffer.from(hexToBytes(header.receiptsRoot.slice(2))),
    Buffer.from(hexToBytes(header.logBloom.slice(2))),
    Buffer.from(hexToBytes(difficulty)),
    Buffer.from(hexToBytes(web3.utils.toBN(header.number).toString('hex'))),
    Buffer.from(hexToBytes(web3.utils.toBN(header.gasLimit).toString('hex'))),
    Buffer.from(hexToBytes(web3.utils.toBN(header.gasUsed).toString('hex'))),
    Buffer.from(hexToBytes(web3.utils.toBN(header.timestamp).toString('hex'))),
    Buffer.from(hexToBytes(header.extraData.slice(2))),
    Buffer.from(hexToBytes(header.mixHash.slice(2))),
    Buffer.from(hexToBytes(header.nonce.slice(2))),
  ];
  return utils.rlp.encode(data);
}