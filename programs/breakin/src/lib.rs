// breakin/programs/breakin/src/lib.rs
use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock::Clock;
use std::mem::size_of;

// IMPORTANT NOTE TO SELF: Replace with your actual Program ID after first deployment!
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod solana_rps_arena {
    use super::*;

    pub fn initialize_game(ctx: Context<InitializeGame>) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        game_state.authority = ctx.accounts.authority.key();
        game_state.next_match_id = 1;
        game_state.total_matches = 0;
        game_state.bump = ctx.bumps.game_state;
        msg!(
            "RPS Arena GameState initialized by: {}. Next Match ID: {}",
            game_state.authority,
            game_state.next_match_id
        );
        Ok(())
    }

    pub fn create_match(
        ctx: Context<CreateMatch>,
        min_bet_threshold_lamports: u64,
        betting_duration_slots: u64,
    ) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state; // mutable borrow
        let betting_pool = &mut ctx.accounts.betting_pool; // mutable borrow
        let clock = Clock::get()?;

        betting_pool.match_id = game_state.next_match_id;
        betting_pool.total_ai1_bets = 0;
        betting_pool.total_ai2_bets = 0;
        betting_pool.status = MatchStatus::OpenForBetting;
        betting_pool.authority = ctx.accounts.match_creator_signer.key();
        betting_pool.min_bet_threshold = min_bet_threshold_lamports;
        betting_pool.betting_deadline_slot = clock
            .slot
            .checked_add(betting_duration_slots)
            .ok_or(RpsError::Overflow)?;
        betting_pool.bump = ctx.bumps.betting_pool;
        betting_pool.pool_authority_bump = ctx.bumps.betting_pool_authority;

        game_state.next_match_id = game_state // game_state still mutably borrowed
            .next_match_id
            .checked_add(1)
            .ok_or(RpsError::Overflow)?;

        msg!(
            "Match #{} created by {}. Betting open until slot ~{}. Min threshold: {} lamports. Pool PDA: {}",
            betting_pool.match_id,
            betting_pool.authority,
            betting_pool.betting_deadline_slot,
            betting_pool.min_bet_threshold,
            betting_pool.key()
        );
        Ok(())
    } // mutable borrows of game_state and betting_pool end here

    pub fn place_bet(ctx: Context<PlaceBet>, amount: u64, prediction_raw: u8) -> Result<()> {
        // Perform read-only checks on betting_pool first
        require!(
            ctx.accounts.betting_pool.status == MatchStatus::OpenForBetting,
            RpsError::BettingClosedOrNotOpen
        );
        let clock = Clock::get()?;
        require!(
            clock.slot < ctx.accounts.betting_pool.betting_deadline_slot,
            RpsError::BettingDeadlinePassed
        );
        require!(amount > 0, RpsError::BetAmountZero);

        let prediction = match prediction_raw {
            0 => Prediction::Ai1,
            1 => Prediction::Ai2,
            _ => return err!(RpsError::InvalidPrediction),
        };

        // CPI Transfer: uses immutable borrows of AccountInfo
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.better.to_account_info(),
                to: ctx.accounts.betting_pool.to_account_info(), // Immutable borrow for CPI
            },
        );
        anchor_lang::system_program::transfer(cpi_context, amount)?;

        // Now, obtain the mutable borrow for betting_pool updates AFTER the CPI
        let betting_pool = &mut ctx.accounts.betting_pool;
        match prediction {
            Prediction::Ai1 => {
                betting_pool.total_ai1_bets = betting_pool
                    .total_ai1_bets
                    .checked_add(amount)
                    .ok_or(RpsError::Overflow)?;
            }
            Prediction::Ai2 => {
                betting_pool.total_ai2_bets = betting_pool
                    .total_ai2_bets
                    .checked_add(amount)
                    .ok_or(RpsError::Overflow)?;
            }
        }
        // betting_pool mutable borrow scope can end here if not needed for user_bet.match_id

        let user_bet = &mut ctx.accounts.user_bet;
        user_bet.better = ctx.accounts.better.key();
        user_bet.match_id = betting_pool.match_id;
        user_bet.prediction = prediction;
        user_bet.amount = amount;
        user_bet.claimed = false;
        user_bet.bump = ctx.bumps.user_bet;

        msg!(
            "User {} bet {} on {:?} for Match #{}. Current slot: {}, Deadline: {}. UserBet PDA: {}",
            user_bet.better,
            amount,
            prediction,
            user_bet.match_id,
            clock.slot,
            betting_pool.betting_deadline_slot,
            user_bet.key()
        );
        Ok(())
    }

    pub fn check_betting_deadline(ctx: Context<CheckBettingDeadline>) -> Result<()> {
        let betting_pool = &mut ctx.accounts.betting_pool; // mutable borrow
        let clock = Clock::get()?;

        require!(
            betting_pool.status == MatchStatus::OpenForBetting,
            RpsError::MatchNotOpenOrAlreadyProcessed
        );
        require!(
            clock.slot >= betting_pool.betting_deadline_slot,
            RpsError::BettingDeadlineNotReached
        );

        let total_bets_placed = betting_pool // still using mutable borrow for reads
            .total_ai1_bets
            .checked_add(betting_pool.total_ai2_bets)
            .ok_or(RpsError::Overflow)?;

        if total_bets_placed >= betting_pool.min_bet_threshold {
            betting_pool.status = MatchStatus::AwaitingResolution;
            msg!("Match #{} deadline passed (Slot {} >= {}). Threshold met ({} >= {}). Now AwaitingResolution.",
                 betting_pool.match_id, clock.slot, betting_pool.betting_deadline_slot, total_bets_placed, betting_pool.min_bet_threshold);
        } else {
            betting_pool.status = MatchStatus::CancelledDueToLowBets;
            msg!("Match #{} deadline passed (Slot {} >= {}). Threshold NOT met ({} < {}). Cancelled, bets refundable.",
                 betting_pool.match_id, clock.slot, betting_pool.betting_deadline_slot, total_bets_placed, betting_pool.min_bet_threshold);
        }
        Ok(())
    } // mutable borrow of betting_pool ends here

    pub fn resolve_match(
        ctx: Context<ResolveMatch>,
        ai1_move_raw: u8,
        ai2_move_raw: u8,
    ) -> Result<()> {
        // betting_pool is mutably borrowed for status update
        // game_state is mutably borrowed for total_matches update
        // match_record is initialized (effectively a mutable operation)

        require!(
            ctx.accounts.betting_pool.status == MatchStatus::AwaitingResolution,
            RpsError::MatchNotAwaitingResolution
        );

        let ai1_move = Move::from_u8(ai1_move_raw)?;
        let ai2_move = Move::from_u8(ai2_move_raw)?;
        let winner = crate::determine_rps_winner(ai1_move, ai2_move);

        let match_record = &mut ctx.accounts.match_record;
        match_record.match_id = ctx.accounts.betting_pool.match_id; // Read from betting_pool
        match_record.timestamp = Clock::get()?.unix_timestamp;
        match_record.ai1_move = ai1_move;
        match_record.ai2_move = ai2_move;
        match_record.winner = winner;
        match_record.total_bet_amount = ctx
            .accounts
            .betting_pool // Read from betting_pool
            .total_ai1_bets
            .checked_add(ctx.accounts.betting_pool.total_ai2_bets)
            .ok_or(RpsError::Overflow)?;
        match_record.bump = ctx.bumps.match_record;

        ctx.accounts.betting_pool.status = MatchStatus::Settled; // Write to betting_pool
        ctx.accounts.game_state.total_matches = ctx
            .accounts
            .game_state // Write to game_state
            .total_matches
            .checked_add(1)
            .ok_or(RpsError::Overflow)?;

        msg!("Match #{} resolved. AI1: {:?}, AI2: {:?}. Winner: {:?}. Total bets: {}. MatchRecord PDA: {}",
            match_record.match_id, ai1_move, ai2_move, winner, match_record.total_bet_amount, match_record.key());
        Ok(())
    }

    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        // Read-only operations first
        require!(!ctx.accounts.user_bet.claimed, RpsError::AlreadyClaimed);
        require!(
            ctx.accounts.user_bet.match_id == ctx.accounts.betting_pool.match_id,
            RpsError::MatchIdMismatch
        );

        let mut payout_amount = 0u64;

        // Scope for reading betting_pool status and potentially match_record
        // All reads from betting_pool here are fine as it's not mutably borrowed *yet* for CPI.
        match ctx.accounts.betting_pool.status {
            MatchStatus::Settled => {
                let match_record = &ctx.accounts.match_record; // immutable borrow of match_record
                require!(
                    match_record.match_id == ctx.accounts.betting_pool.match_id,
                    RpsError::MatchIdMismatchInRecord
                );

                let user_predicted_winner_type = match ctx.accounts.user_bet.prediction {
                    Prediction::Ai1 => Winner::Ai1,
                    Prediction::Ai2 => Winner::Ai2,
                };

                if match_record.winner == Winner::Draw {
                    payout_amount = ctx.accounts.user_bet.amount;
                } else if user_predicted_winner_type == match_record.winner {
                    let (total_bets_on_winner, total_bets_on_loser) = match match_record.winner {
                        Winner::Ai1 => (
                            ctx.accounts.betting_pool.total_ai1_bets,
                            ctx.accounts.betting_pool.total_ai2_bets,
                        ),
                        Winner::Ai2 => (
                            ctx.accounts.betting_pool.total_ai2_bets,
                            ctx.accounts.betting_pool.total_ai1_bets,
                        ),
                        Winner::Draw => (0, 0),
                    };
                    if total_bets_on_winner == 0 {
                        return err!(RpsError::NoWinningBets);
                    }
                    let user_profit = total_bets_on_loser
                        .checked_mul(ctx.accounts.user_bet.amount)
                        .ok_or(RpsError::Overflow)?
                        .checked_div(total_bets_on_winner)
                        .ok_or(RpsError::DivisionByZero)?;
                    payout_amount = ctx
                        .accounts
                        .user_bet
                        .amount
                        .checked_add(user_profit)
                        .ok_or(RpsError::Overflow)?;
                } else {
                    payout_amount = 0;
                }
            }
            MatchStatus::CancelledDueToLowBets => {
                payout_amount = ctx.accounts.user_bet.amount;
                msg!(
                    "Match #{} was cancelled (low bets). Refunding bet of {} to user {}.",
                    ctx.accounts.user_bet.match_id,
                    payout_amount,
                    ctx.accounts.user_bet.better
                );
            }
            _ => return err!(RpsError::MatchNotReadyForClaimOrRefund),
        }

        if payout_amount > 0 {
            let authority_seeds = &[
                b"betting_pool_authority".as_ref(),
                &ctx.accounts.betting_pool.match_id.to_le_bytes(), // Read from betting_pool
                &[ctx.accounts.betting_pool.pool_authority_bump],  // Read from betting_pool
            ];
            let signer_seeds = &[&authority_seeds[..]];

            let cpi_context_signed = CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    // Immutable borrow of betting_pool's AccountInfo for CPI
                    from: ctx.accounts.betting_pool.to_account_info(),
                    to: ctx.accounts.better.to_account_info(),
                },
                signer_seeds,
            );
            anchor_lang::system_program::transfer(cpi_context_signed, payout_amount)?;
            // msg!(/* ... */);
        }

        // Mutable borrow of user_bet for update, AFTER all other uses of user_bet (for reads)
        // and after CPI which doesn't involve user_bet mutably.
        ctx.accounts.user_bet.claimed = true;
        Ok(())
    }
} // end of #[program] mod

// Helper function moved outside, ensure it's callable (pub if needed by other modules, or just visible here)
pub fn determine_rps_winner(move1: Move, move2: Move) -> Winner {
    if move1 == move2 {
        Winner::Draw
    } else if (move1 == Move::Rock && move2 == Move::Scissors)
        || (move1 == Move::Paper && move2 == Move::Rock)
        || (move1 == Move::Scissors && move2 == Move::Paper)
    {
        Winner::Ai1
    } else {
        Winner::Ai2
    }
}

// --- ACCOUNTS CONTEXTS ---
#[derive(Accounts)]
pub struct InitializeGame<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + GameState::LEN,
        seeds = [b"game_state".as_ref()],
        bump
    )]
    pub game_state: Account<'info, GameState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(min_bet_threshold_lamports: u64, betting_duration_slots: u64)]
pub struct CreateMatch<'info> {
    #[account(
        mut,
        seeds = [b"game_state".as_ref()],
        bump = game_state.bump
    )]
    pub game_state: Account<'info, GameState>,
    #[account(
        init,
        payer = match_creator_signer,
        space = 8 + BettingPool::LEN,
        seeds = [b"betting_pool".as_ref(), &game_state.next_match_id.to_le_bytes()],
        bump
    )]
    pub betting_pool: Account<'info, BettingPool>,
    #[account(
        seeds = [b"betting_pool_authority".as_ref(), &game_state.next_match_id.to_le_bytes()],
        bump
    )]
    /// CHECK: PDA authority, no data stored.
    pub betting_pool_authority: AccountInfo<'info>,
    #[account(mut)]
    pub match_creator_signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, prediction_raw: u8)]
pub struct PlaceBet<'info> {
    #[account(
        mut, // betting_pool is mutable here because its fields total_ai1_bets etc. are updated AFTER CPI
        seeds = [b"betting_pool".as_ref(), &betting_pool.match_id.to_le_bytes()],
        bump = betting_pool.bump
    )]
    pub betting_pool: Account<'info, BettingPool>,
    #[account(
        init,
        payer = better,
        space = 8 + UserBet::LEN,
        seeds = [
            b"user_bet".as_ref(),
            better.key().as_ref(),
            &betting_pool.match_id.to_le_bytes() // This read from betting_pool is fine
        ],
        bump
    )]
    pub user_bet: Account<'info, UserBet>,
    #[account(mut)]
    pub better: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(match_id_arg: u64)]
pub struct CheckBettingDeadline<'info> {
    #[account(
        mut,
        seeds = [b"betting_pool".as_ref(), &match_id_arg.to_le_bytes()],
        bump = betting_pool.bump
    )]
    pub betting_pool: Account<'info, BettingPool>,
}

#[derive(Accounts)]
#[instruction(ai1_move_raw: u8, ai2_move_raw: u8)]
pub struct ResolveMatch<'info> {
    #[account(
        mut,
        seeds = [b"game_state".as_ref()],
        bump = game_state.bump
    )]
    pub game_state: Account<'info, GameState>,
    #[account(
        mut, // betting_pool is mutable for status update
        seeds = [b"betting_pool".as_ref(), &betting_pool.match_id.to_le_bytes()],
        bump = betting_pool.bump,
        constraint = betting_pool.authority == resolver_signer.key() @ RpsError::Unauthorized
    )]
    pub betting_pool: Account<'info, BettingPool>,
    #[account(
        init,
        payer = resolver_signer,
        space = 8 + MatchRecord::LEN,
        seeds = [b"match_record".as_ref(), &betting_pool.match_id.to_le_bytes()], // Read from betting_pool fine
        bump
    )]
    pub match_record: Account<'info, MatchRecord>,
    #[account(mut)]
    pub resolver_signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(
        mut, // betting_pool is mutable for CPI (SOL transfer from it)
        seeds = [b"betting_pool".as_ref(), &user_bet.match_id.to_le_bytes()],
        bump = betting_pool.bump
    )]
    pub betting_pool: Account<'info, BettingPool>,
    #[account(
        seeds = [b"betting_pool_authority".as_ref(), &user_bet.match_id.to_le_bytes()],
        bump = betting_pool.pool_authority_bump
    )]
    /// CHECK: PDA authority, no data stored.
    pub betting_pool_authority: AccountInfo<'info>,
    #[account(
        seeds = [b"match_record".as_ref(), &user_bet.match_id.to_le_bytes()],
        bump = match_record.bump
    )]
    pub match_record: Account<'info, MatchRecord>,
    #[account(
        mut, // user_bet is mutable for `claimed` field update
        seeds = [
            b"user_bet".as_ref(),
            better.key().as_ref(),
            &user_bet.match_id.to_le_bytes()
        ],
        bump = user_bet.bump,
        constraint = user_bet.better == better.key() @ RpsError::UserBetOwnerMismatch
    )]
    pub user_bet: Account<'info, UserBet>,
    #[account(mut)]
    pub better: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// --- DATA STRUCTURES (ACCOUNTS & ENUMS) ---
// ... (These should be correct from the previous full version) ...
#[account]
#[derive(Default)]
pub struct GameState {
    pub authority: Pubkey,
    pub next_match_id: u64,
    pub total_matches: u64,
    pub bump: u8,
}
impl GameState {
    const LEN: usize = 32 + 8 + 8 + 1;
}

#[account]
#[derive(Default)]
pub struct BettingPool {
    pub authority: Pubkey,
    pub match_id: u64,
    pub total_ai1_bets: u64,
    pub total_ai2_bets: u64,
    pub status: MatchStatus,
    pub bump: u8,
    pub pool_authority_bump: u8,
    pub betting_deadline_slot: u64,
    pub min_bet_threshold: u64,
}
impl BettingPool {
    const LEN: usize = 32 + 8 + 8 + 8 + 1 + 1 + 1 + 8 + 8;
}

#[account]
#[derive(Default)]
pub struct MatchRecord {
    pub match_id: u64,
    pub timestamp: i64,
    pub ai1_move: Move,
    pub ai2_move: Move,
    pub winner: Winner,
    pub total_bet_amount: u64,
    pub bump: u8,
}
impl MatchRecord {
    const LEN: usize = 8 + 8 + 1 + 1 + 1 + 8 + 1;
}

#[account]
#[derive(Default)]
pub struct UserBet {
    pub better: Pubkey,
    pub match_id: u64,
    pub prediction: Prediction,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}
impl UserBet {
    const LEN: usize = 32 + 8 + 1 + 8 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum MatchStatus {
    #[default]
    OpenForBetting,
    AwaitingResolution,
    Settled,
    CancelledDueToLowBets,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Move {
    #[default]
    Rock,
    Paper,
    Scissors,
}
impl Move {
    fn from_u8(value: u8) -> Result<Self> {
        match value {
            0 => Ok(Move::Rock),
            1 => Ok(Move::Paper),
            2 => Ok(Move::Scissors),
            _ => Err(RpsError::InvalidMoveValue.into()),
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Winner {
    #[default]
    Ai1,
    Ai2,
    Draw,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Prediction {
    #[default]
    Ai1,
    Ai2,
}

#[error_code]
pub enum RpsError {
    #[msg("A numeric operation caused an overflow.")]
    Overflow,
    #[msg("Action unauthorized. Signer does not have required permissions.")]
    Unauthorized,
    #[msg("Betting is closed or not yet open for this match.")]
    BettingClosedOrNotOpen,
    #[msg("Betting deadline for this match has already passed.")]
    BettingDeadlinePassed,
    #[msg("Bet amount must be greater than zero.")]
    BetAmountZero,
    #[msg("Invalid prediction value (must be 0 for AI1 or 1 for AI2).")]
    InvalidPrediction,
    #[msg("The provided match_id does not match the account's match_id.")]
    MatchIdMismatch,
    #[msg("The winner for this match has not been set yet (internal error).")]
    WinnerNotSet,
    #[msg("This bet has already been claimed.")]
    AlreadyClaimed,
    #[msg("Match is not in a state where claims or refunds are allowed.")]
    MatchNotReadyForClaimOrRefund,
    #[msg("No bets were placed on the winning outcome, or division by zero would occur.")]
    NoWinningBets,
    #[msg("The signer does not own this bet receipt.")]
    UserBetOwnerMismatch,
    #[msg("Division by zero occurred during payout calculation.")]
    DivisionByZero,
    #[msg("Invalid move value (must be 0 for Rock, 1 for Paper, 2 for Scissors).")]
    InvalidMoveValue,
    #[msg("Betting deadline for this match has not been reached yet.")]
    BettingDeadlineNotReached,
    #[msg("This match is not open for betting or has already been processed by deadline check.")]
    MatchNotOpenOrAlreadyProcessed,
    #[msg("Match is not in AwaitingResolution state, cannot resolve with AI moves.")]
    MatchNotAwaitingResolution,
    #[msg("Match record's ID does not match the betting pool's ID during claim.")]
    MatchIdMismatchInRecord,
}
