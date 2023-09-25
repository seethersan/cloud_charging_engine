import express from "express";
import { createClient } from "redis";
import { json } from "body-parser";

const DEFAULT_BALANCE = 100;

interface ChargeResult {
    isAuthorized: boolean;
    remainingBalance: number;
    charges: number;
}

// Create a single Redis client and connect it
const redisClient = createClient({
    url: `redis://${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`,
});
redisClient.connect();

async function reset(account: string): Promise<void> {
    try {
        await redisClient.set(`${account}/balance`, DEFAULT_BALANCE.toString());
    } catch (e) {
        console.error("Error while resetting account", e);
        throw e;
    }
}

async function charge(account: string, charges: number): Promise<ChargeResult> {
    try {
        const balance = parseInt((await redisClient.get(`${account}/balance`)) ?? "");
        if (balance >= charges) {
            await redisClient.set(`${account}/balance`, (balance - charges).toString());
            const remainingBalance = parseInt((await redisClient.get(`${account}/balance`)) ?? "");
            return { isAuthorized: true, remainingBalance, charges };
        } else {
            // Ensure balance is never negative
            if (balance < 0) {
                await redisClient.set(`${account}/balance`, "0");
            }
            return { isAuthorized: false, remainingBalance: balance, charges: 0 };
        }
    } catch (e) {
        console.error("Error while charging account", e);
        throw e;
    }
}

export function buildApp(): express.Application {
    const app = express();
    app.use(json());
    app.post("/reset", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            await reset(account);
            console.log(`Successfully reset account ${account}`);
            res.sendStatus(204);
        } catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    app.post("/charge", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            const result = await charge(account, req.body.charges ?? 10);
            console.log(`Successfully charged account ${account}`);
            res.status(200).json(result);
        } catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    return app;
}