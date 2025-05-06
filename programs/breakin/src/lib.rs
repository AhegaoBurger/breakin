use anchor_lang::prelude::*;

declare_id!("J74d59P5hknEH3bJyf1DsVLtLEWU9QgPQ1Kdpv6Q3hud");

#[program]
pub mod breakin {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
