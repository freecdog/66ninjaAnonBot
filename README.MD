# 66ninjaAnonBot

## Based on
* https://github.com/grammyjs/examples/tree/main/setups/deno-deploy
* https://github.com/grammyjs/examples/tree/main/setups/deno-fresh-web-app

## Run locally
create file .env.local
```
BOT_TOKEN=your_bot_token
```

Run Deno
```
deno task dev
```

## Run on Deno
Set your bot’s webhook url to
https://api.telegram.org/bot<your_bot_token>/setWebhook?url=https://<your_deno_project_name>.deno.dev/your_bot_token
