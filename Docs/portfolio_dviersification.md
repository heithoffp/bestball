 I want you to theorize a "draft player picker" formula based off portfolio optimization theory. 



The inputs are as follows: 

1. we have a set list of available players to select next with an average draft position (ADP) that correlates to that player's projected points. 

2. We have our current roster of players for the current draft.

3. We have a history of all of our past rosters and players that were selected prior.

4. we are constrained by a chosen strategy (hero, hyper-fragile, zero) and thus constrains what position of need we need (rb, wr, etc.) Occasionally we are indifferent

5. We have correlation knowledge of this player with our given roster. (This may essentially help the players projected points at their adp) the correlation might by qb-wr. wr-wr, or opposing team week 17 correlation or anything that might affect this.



What algorithm would you devise that would rank a given set of players from best pick to worst with best meaning the most optimal in terms of projected points and portfolio diversification. 