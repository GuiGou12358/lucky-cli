import yargs from 'yargs/yargs';
import {displayConfiguration, initConfiguration} from './config';
import {initConnection as initPhatContractConnection} from './phatContractHelper';
import {checkGrants, checkRaffleConsumerConfiguration} from './checks';
import {getEraInfo, getLastEraReceivedReward} from './queryIndexer';
import {claimDAppStaking, getCurrentEra} from './dAppStaking';
import {getNextEraInRaffleConsumer} from './raffleConsumer';
import {callRafflePhatContract} from './raffle';
import {initConnection as initSmartContractConnection} from "./smartContractHelper";

const argv = yargs(process.argv.slice(2)).options({
    dc: {alias: 'displayConfiguration', desc: 'Display the configuration (contract and http addresses)'},
    di: {alias: 'displayInformation', desc: 'Display information from indexer and smart contracts'},
    ch: {alias: 'checks', desc: 'Check if the grants and the configuration in the smart contracts have been set'},
    cl: {alias: 'claim', desc: 'Claim dApp staking developer rewards (for all missing era)'},
    r:  {alias: 'raffle', desc: 'Start the raffle for all missing era'},
    net: {alias: 'network', choices:['shibuya', 'shiden', 'astar'], type:'string', desc: 'Specify the network', requiresArg: true},
    d: {alias: 'debug', desc: 'Debug mode: display more information'},
}).version('0.1').parseSync();


export function isDebug() : boolean{
    return argv.debug != undefined;
}


async function claimEra(era: Number) : Promise<void> {

    return getEraInfo(era)
        .then((eraInfo) => {
            if (eraInfo.subPeriod != "Voting") {
                return claimDAppStaking(eraInfo.era);
            } else {
                console.log("No reward for voting sub-period");
            }
        });
}

async function claimAllEras() : Promise<void>{

    const lastEraReceivedReward = await getLastEraReceivedReward() as number;
    const currentEra = await getCurrentEra() as number;

    let era = +lastEraReceivedReward + 1;

    while (era < currentEra){
        console.log("Claim era %s", era);
        await claimEra(era).then(
            () => {
                console.log("Successfully claim rewards for era %s", era);
                era += 1;
            }
        ).catch( (error) => {
            console.log("Error when claiming the rewards for era %s", era);
            return Promise.reject(error);
        });
    }
}

async function runRaffle() : Promise<void>{

    let nextEra = await getNextEraInRaffleConsumer();
    const currentEra = await getCurrentEra();

    while (nextEra < currentEra){
        console.log("Run raffle for era %s", nextEra);
        await callRafflePhatContract().then(
            () => {
                console.log("Successfully run the raffle for era %s", nextEra);
            }
        ).catch( (error) => {
            console.log("Error when running the raffle for era %s", nextEra);
            return Promise.reject(error);
        });

        // wait 30 seconds
        await new Promise( resolve => setTimeout(resolve, 30000));

        nextEra = await getNextEraInRaffleConsumer();
    }
}


async function run() : Promise<void>{

    if (!argv.displayConfiguration && !argv.displayInformation && !argv.checks && !argv.claim && !argv.raffle) {
        return Promise.reject('At least one option is required. Use --help for more information');
    }

    if (argv.net == undefined) {
        return Promise.reject('The network is mandatory');
    } else {
        initConfiguration(argv.net);
    }

    if (argv.displayConfiguration) {
        displayConfiguration();
    }

    await initSmartContractConnection();

    if (argv.displayInformation) {
        await getCurrentEra();
        await getLastEraReceivedReward();
        //await getLastEraRaffleDone();
        await getNextEraInRaffleConsumer();
    }

    if (argv.checks) {
        await checkGrants();
        await checkRaffleConsumerConfiguration();
    }

    if (argv.claim) {
        await claimAllEras();
    }

    if (argv.raffle) {
        await initPhatContractConnection();
        await runRaffle();
    }
}

run().catch(console.error).finally(() => process.exit());


