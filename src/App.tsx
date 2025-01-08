import { useState, useEffect, ChangeEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';
import { SortableItem } from './components/SortableItem';
import { X } from 'lucide-react';

interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          user_id: number;
          name: string;
          email: string | null;
          created_at: string;
        };
        Insert: {
          user_id?: number;
          name: string;
          email?: string | null;
          created_at?: string;
        };
        Update: {
          user_id?: number;
          name?: string;
          email?: string | null;
          created_at?: string;
        };
      };
      movie_nights: {
        Row: {
          night_id: number;
          date: string;
          movie_id: number | null;
        };
        Insert: {
          night_id?: number;
          date: string;
          movie_id?: number | null;
        };
        Update: {
          night_id?: number;
          date?: string;
          movie_id?: number | null;
        };
      };
      submissions: {
        Row: {
          submission_id: number;
          night_id: number;
          user_id: number;
          movie_id: number;
          created_at: string;
        };
        Insert: {
          submission_id?: number;
          night_id: number;
          user_id: number;
          movie_id: number;
          created_at?: string;
        };
        Update: {
          submission_id?: number;
          night_id?: number;
          user_id?: number;
          movie_id?: number;
          created_at?: string;
        };
      };
      votes: {
        Row: {
          vote_id: number;
          submission_id: number;
          user_id: number;
          rank: number;
          created_at: string;
        };
        Insert: {
          vote_id?: number;
          submission_id: number;
          user_id: number;
          rank: number;
          created_at?: string;
        };
        Update: {
          vote_id?: number;
          submission_id?: number;
          user_id?: number;
          rank?: number;
          created_at?: string;
        };
      };
    };
  };
}

interface SubmissionWithDetails {
  submission_id: number;
  night_id: number;
  user_id: number;
  movie_id: number;
  created_at: string;
  users: Database['public']['Tables']['users']['Row'] | null;
  votes: Database['public']['Tables']['votes']['Row'][];
  voteCount: number;
}

interface MovieResult {
  id: number;
  title: string;
  release_date: string;
  overview: string;
  poster_path: string | null;
  runtime?: number;
}


type Phase = 'submission' | 'voting' | 'winner';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;
const supabase = createClient<Database>(supabaseUrl, supabaseKey);

const TMDB_API_KEY = process.env.TMDB_API_KEY!;
const TMDB_API_URL = 'https://api.themoviedb.org/3/search/movie';
const TMDB_IMG_URL = 'https://image.tmdb.org/t/p/w500';
const TMDB_MOVIE_URL = 'https://api.themoviedb.org/3/movie';
const APARTMENT_PASSWORD = process.env.APARTMENT_PASSWORD!;

const calculateInstantRunoffWinner = (submissions: SubmissionWithDetails[]): SubmissionWithDetails | null => {
  if (submissions.length === 0) return null;

  const votesBySubmission = submissions.reduce((acc, submission) => {
    acc[submission.submission_id] = submission.votes || [];
    return acc;
  }, {} as Record<number, Database['public']['Tables']['votes']['Row'][]>);

  let remainingSubmissions = [...submissions];
  let winner: SubmissionWithDetails | null = null;

  while (!winner && remainingSubmissions.length > 0) {
    const voteCounts = new Map<number, number>();
    remainingSubmissions.forEach(submission => {
      const firstChoiceVotes = votesBySubmission[submission.submission_id]
        .filter(vote => vote.rank === 1)
        .length;
      voteCounts.set(submission.submission_id, firstChoiceVotes);
    });

    const totalVotes = Array.from(voteCounts.values()).reduce((sum, count) => sum + count, 0);
    for (const submission of remainingSubmissions) {
      const voteCount = voteCounts.get(submission.submission_id) || 0;
      if (voteCount > totalVotes / 2) {
        winner = submission;
        break;
      }
    }

    if (!winner) {
      const minVotes = Math.min(...Array.from(voteCounts.values()));
      const losingSubmissionId = Array.from(voteCounts.entries())
        .find(([_, count]) => count === minVotes)?.[0];
      
      remainingSubmissions = remainingSubmissions
        .filter(s => s.submission_id !== losingSubmissionId);

      if (losingSubmissionId) {
        Object.values(votesBySubmission).forEach(votes => {
          votes.forEach(vote => {
            if (vote.rank > voteCounts.get(losingSubmissionId)!) {
              vote.rank -= 1;
            }
          });
        });
      }
    }
  }

  return winner || remainingSubmissions[0] || null;
};

const fetchMovieDetails = async (movieId: number): Promise<MovieResult | null> => {
  try {
    const response = await fetch(
      `${TMDB_MOVIE_URL}/${movieId}?language=en-US`,
      {
        headers: {
          Authorization: `Bearer ${TMDB_API_KEY}`,
          accept: 'application/json',
        },
      }
    );
    const data = await response.json();
    return {
      id: data.id,
      title: data.title,
      release_date: data.release_date,
      overview: data.overview,
      poster_path: data.poster_path,
      runtime: data.runtime
    };
  } catch (err) {
    console.error('Error fetching movie details:', err);
    return null;
  }
};

const MovieDisplay = ({ movieId }: { movieId: number }) => {
  const [movieDetails, setMovieDetails] = useState<MovieResult | null>(null);

  useEffect(() => {
    const getMovieDetails = async () => {
      const details = await fetchMovieDetails(movieId);
      setMovieDetails(details);
    };

    getMovieDetails();
  }, [movieId]);

  if (!movieDetails) return <div>Loading...</div>;

  return (
    <div className="flex gap-4">
      {movieDetails.poster_path && (
        <img 
          src={`${TMDB_IMG_URL}${movieDetails.poster_path}`}
          alt={movieDetails.title}
          className="w-24 h-36 object-cover rounded shrink-0"
        />
      )}
      <div className="text-left">
        <p className="font-medium">
          {movieDetails.title} ({new Date(movieDetails.release_date).getFullYear()})
          {movieDetails.runtime && ` • ${Math.floor(movieDetails.runtime / 60)}h ${movieDetails.runtime % 60}m`}
        </p>
        <p className="text-sm text-gray-600 mt-2">{movieDetails.overview}</p>
      </div>
    </div>
  );
};

const getNextPhaseTime = (currentPhase: Phase): Date => {
  const now = new Date();
  const thursday = new Date(now);
  thursday.setDate(now.getDate() + (4 - now.getDay()));
  thursday.setHours(17, 0, 0, 0); // 5 PM

  const tuesday = new Date(now);
  tuesday.setDate(now.getDate() + (2 - now.getDay()));
  tuesday.setHours(23, 59, 0, 0); // 11:59 PM

  const friday = new Date(now);
  friday.setDate(now.getDate() + (5 - now.getDay()));
  friday.setHours(8, 0, 0, 0); // 8 AM

  switch (currentPhase) {
    case 'submission':
      return tuesday;
    case 'voting':
      return thursday;
    case 'winner':
      return friday;
    default:
      return now;
  }
};

const formatDateTime = (date: Date): string => {
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const getPhaseMessage = (phase: Phase): string => {
  const nextTime = getNextPhaseTime(phase);
  
  switch (phase) {
    case 'submission':
      return `Submissions close ${formatDateTime(nextTime)}`;
    case 'voting':
      return `Voting ends ${formatDateTime(nextTime)}`;
    case 'winner':
      return `Next submissions open ${formatDateTime(nextTime)}`;
    default:
      return '';
  }
};

const TMDBAttribution = () => (
  <div className="flex flex-col items-center justify-center gap-2 py-8 mt-8 border-t">
    <img 
      src="/tmdb_logo.svg" 
      alt="TMDB Logo" 
      className="h-8"
    />
    <p className="text-sm text-gray-600 text-center">
      This product uses the TMDB API but is not endorsed or certified by TMDB
    </p>
  </div>
);

function App() {
  const [currentPhase, setCurrentPhase] = useState<Phase>('submission');
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([]);
  const [movieTitle, setMovieTitle] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<Database['public']['Tables']['users']['Row'] | null>(null);
  const [winner, setWinner] = useState<SubmissionWithDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);
  const [showPastWinners, setShowPastWinners] = useState<boolean>(false);
  const [pastWinners, setPastWinners] = useState<SubmissionWithDetails[]>([]);
  const [searchResults, setSearchResults] = useState<MovieResult[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<MovieResult | null>(null);
  const [userVotes, setUserVotes] = useState<SubmissionWithDetails[]>([]); // Add this new state
  const [hasVoted, setHasVoted] = useState<boolean>(false);
  const [isEditingVotes, setIsEditingVotes] = useState<boolean>(false);
  const [isLoadingVotes, setIsLoadingVotes] = useState<boolean>(false);
  const MAX_SUBMISSIONS = 2;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (!isAdminMode) {
      determineCurrentPhase();
    }
    if (isLoggedIn) {
      if (showPastWinners) {
        fetchPastWinners();
      } else {
        fetchSubmissions();
      }
    }
  }, [isLoggedIn, isAdminMode, showPastWinners]);

  useEffect(() => {
    if (currentPhase === 'winner' && submissions.length > 0) {
      const winningSubmission = calculateInstantRunoffWinner(submissions);
      setWinner(winningSubmission);
    }
  }, [currentPhase, submissions]);

  const handleLogin = async () => {
    if (password !== APARTMENT_PASSWORD) {
      setError('Invalid password');
      return;
    }

    try {
      if (username.toLowerCase() === 'avi') {
        setIsAdminMode(true);
      }

      const { data, error } = await supabase
        .from('users')
        .select()
        .eq('name', username)
        .single();

      if (error) {
        // If user doesn't exist, create new user
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({ name: username })
          .select()
          .single();

        if (createError) throw createError;
        setCurrentUser(newUser);
      } else {
        setCurrentUser(data);
      }

      setIsLoggedIn(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const determineCurrentPhase = (): void => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 4 = Thursday

    if (dayOfWeek === 4) { // Thursday
      setCurrentPhase('winner');
    } else if (dayOfWeek >= 2) { // Tuesday-Wednesday
      setCurrentPhase('voting');
    } else {
      setCurrentPhase('submission');
    }
  };

  const fetchSubmissions = async (): Promise<void> => {
    try {
      const currentNightId = getCurrentMovieNight();
      const { data, error } = await supabase
        .from('submissions')
        .select(`
          *,
          users (*),
          votes (*)
        `)
        .eq('night_id', currentNightId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const submissionsWithDetails: SubmissionWithDetails[] = data.map(submission => ({
        ...submission,
        voteCount: submission.votes?.length || 0
      }));

      setSubmissions(submissionsWithDetails);
      if (userVotes.length === 0) {
        setUserVotes(submissionsWithDetails);
      }
      
      if (currentUser) {
        await checkUserVotes(currentUser.user_id, getCurrentMovieNight());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching submissions:', err);
    }
  };

  const fetchPastWinners = async (): Promise<void> => {
    try {
      const currentNightId = getCurrentMovieNight();
      const { data: allSubmissions, error } = await supabase
        .from('submissions')
        .select(`
          *,
          users (*),
          votes (*)
        `)
        .lt('night_id', currentNightId)
        .order('night_id', { ascending: false });

      if (error) throw error;

      const winners = Object.values(
        allSubmissions.reduce<Record<number, SubmissionWithDetails>>((acc, submission) => {
          const nightId = submission.night_id;
          const voteCount = submission.votes?.length || 0;
          
          if (!acc[nightId] || voteCount > (acc[nightId].voteCount || 0)) {
            acc[nightId] = {
              ...submission,
              voteCount
            };
          }
          
          return acc;
        }, {})
      ) as SubmissionWithDetails[];

      setPastWinners(winners);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching past winners:', err);
    }
  };

  const ensureMovieNightExists = async (nightId: number): Promise<boolean> => {
    try {
      const { data, error: checkError } = await supabase
        .from('movie_nights')
        .select('*')
        .eq('night_id', nightId);

      if (checkError) throw checkError;

      if (!data || data.length === 0) {
        const { error: createError } = await supabase
          .from('movie_nights')
          .insert({
            night_id: nightId,
            date: new Date().toISOString(),
            movie_id: null
          });

        if (createError) throw createError;
      }

      return true;
    } catch (err) {
      console.error('Error ensuring movie night exists:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      return false;
    }
  };

  const getCurrentMovieNight = (): number => {
    const startDate = new Date('2023-01-18'); // First Thursday
    const today = new Date();
    const timeDiff = today.getTime() - startDate.getTime();
    const weeksDiff = Math.ceil(timeDiff / (7 * 24 * 60 * 60 * 1000));
    return Math.max(1, weeksDiff); // Ensure we never return less than 1
  };

  const searchMovies = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await fetch(
        `${TMDB_API_URL}?query=${encodeURIComponent(query)}&include_adult=true&language=en-US&page=1`,
        {
          headers: {
            Authorization: `Bearer ${TMDB_API_KEY}`,
            accept: 'application/json',
          },
        }
      );
      const data = await response.json();
      setSearchResults(data.results.slice(0, 5));
    } catch (err) {
      console.error('Error searching movies:', err);
    }
  };

  const handleSubmitMovie = async (): Promise<void> => {
    if (!selectedMovie || !currentUser) return;

    try {
      const userSubmissions = submissions.filter(s => s.user_id === currentUser.user_id);
      if (userSubmissions.length >= MAX_SUBMISSIONS) {
        setError(`You can only submit ${MAX_SUBMISSIONS} movies per movie night`);
        return;
      }

      const nightId = getCurrentMovieNight();
      const success = await ensureMovieNightExists(nightId);
      if (!success) {
        throw new Error('Failed to create movie night');
      }

      const { error } = await supabase
        .from('submissions')
        .insert({
          night_id: nightId,
          user_id: currentUser.user_id,
          movie_id: selectedMovie.id
        });

      if (error) throw error;

      setMovieTitle('');
      setSelectedMovie(null);
      setSearchResults([]);
      fetchSubmissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleDeleteSubmission = async (submissionId: number) => {
    if (!currentUser) return;

    try {
      const { error } = await supabase
        .from('submissions')
        .delete()
        .eq('submission_id', submissionId)
        .eq('user_id', currentUser.user_id);

      if (error) throw error;

      fetchSubmissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleSubmitVotes = async () => {
    if (!currentUser) return;
    
    try {
      const { error: deleteError } = await supabase
        .from('votes')
        .delete()
        .eq('user_id', currentUser.user_id)
        .in('submission_id', userVotes.map(s => s.submission_id));

      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase
        .from('votes')
        .insert(
          userVotes.map((submission, index) => ({
            submission_id: submission.submission_id,
            user_id: currentUser.user_id,
            rank: index + 1
          }))
        );

      if (insertError) throw insertError;

      fetchSubmissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const checkUserVotes = async (userId: number, nightId: number) => {
    try {
      const { data, error } = await supabase
        .from('votes')
        .select('*, submissions!inner(night_id)')
        .eq('user_id', userId)
        .eq('submissions.night_id', nightId)
        .in('submission_id', submissions.map(s => s.submission_id));

      if (error) throw error;
      
      setHasVoted(data.length > 0);
      if (data.length > 0) {
        const submissionsWithRanks = [...submissions].sort((a, b) => {
          const voteA = data.find(v => v.submission_id === a.submission_id);
          const voteB = data.find(v => v.submission_id === b.submission_id);
          return (voteA?.rank || 0) - (voteB?.rank || 0);
        });
        setUserVotes(submissionsWithRanks);
      }
    } catch (err) {
      console.error('Error checking user votes:', err);
    }
  };

  const handlePhaseChange = async (newPhase: Phase) => {
    setCurrentPhase(newPhase);
    if (newPhase === 'voting') {
      setIsLoadingVotes(true);
      setHasVoted(false);
      setIsEditingVotes(false);
      
      // Fetch fresh submissions first
      try {
        const currentNightId = getCurrentMovieNight();
        const { data, error } = await supabase
          .from('submissions')
          .select(`
            *,
            users (*),
            votes (*)
          `)
          .eq('night_id', currentNightId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const submissionsWithDetails = data.map(submission => ({
          ...submission,
          voteCount: submission.votes?.length || 0
        }));

        setSubmissions(submissionsWithDetails);
        setUserVotes(submissionsWithDetails);

        // Check user votes after setting submissions
        if (currentUser) {
          await checkUserVotes(currentUser.user_id, currentNightId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoadingVotes(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="p-4 max-w-4xl mx-auto flex-1 w-full">
        {!isLoggedIn ? (
          <Card>
            <CardHeader>
              <CardTitle>Super Secure Login (SSL)</CardTitle>
            </CardHeader>
            <CardContent>
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}
              <div className="space-y-4">
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your name"
                />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter avi's apartment number"
                />
                <Button onClick={handleLogin} className="w-full">
                  Login
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex justify-end mb-4">
              <Button
                variant="outline"
                onClick={() => setShowPastWinners(!showPastWinners)}
              >
                {showPastWinners ? 'Current Movie Night' : 'Past Winners'}
              </Button>
            </div>

            {showPastWinners ? (
              <Card>
                <CardHeader>
                  <CardTitle>Past Movie Night Winners</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {pastWinners.map((winner) => (
                      <div key={winner.night_id} className="p-4 border rounded">
                        <MovieDisplay 
                          movieId={winner.movie_id}
                        />
                        <p className="text-sm text-gray-600 mt-2">
                          Movie Night #{winner.night_id} | Votes: {winner.voteCount}
                        </p>
                        <p className="text-sm text-gray-600">
                          Submitted by: {winner.users?.name}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="mb-8">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Movie Night - {currentPhase.toUpperCase()}</CardTitle>
                      <p className="text-sm text-gray-500 mt-1">
                        {getPhaseMessage(currentPhase)}
                      </p>
                    </div>
                    {isAdminMode && (
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handlePhaseChange('submission')}
                        >
                          Submission
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handlePhaseChange('voting')}
                        >
                          Voting
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handlePhaseChange('winner')}
                        >
                          Winner
                        </Button>
                      </div>
                    )}
                  </div>
                  {isAdminMode && (
                    <p className="text-sm text-gray-500">
                      Movie Night ID: {getCurrentMovieNight()}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                      {error}
                    </div>
                  )}

                  {currentPhase === 'submission' && (
                    <div className="space-y-4">
                      <p className="text-sm text-gray-600">
                        You have submitted {submissions.filter(s => s.user_id === currentUser?.user_id).length}/{MAX_SUBMISSIONS} movies
                      </p>
                      <div className="flex flex-col gap-2">
                        <div className="relative">
                          <Input
                            type="text"
                            value={movieTitle}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => {
                              setMovieTitle(e.target.value);
                              searchMovies(e.target.value);
                            }}
                            placeholder="Search for a movie"
                            className="flex-1"
                          />
                          {searchResults.length > 0 && (
                            <div className="absolute z-10 w-full bg-white border rounded-md mt-1 shadow-lg">
                              {searchResults.map((movie) => (
                                <div
                                  key={movie.id}
                                  className="p-2 hover:bg-gray-100 cursor-pointer"
                                  onClick={() => {
                                    setSelectedMovie(movie);
                                    setMovieTitle(movie.title);
                                    setSearchResults([]);
                                  }}
                                >
                                  <p className="font-medium">{movie.title}</p>
                                  <p className="text-sm text-gray-600">
                                    {new Date(movie.release_date).getFullYear()}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button 
                          onClick={handleSubmitMovie}
                          disabled={!selectedMovie}
                        >
                          Submit Movie
                        </Button>
                      </div>

                      {/* Update the submissions display */}
                      <div className="space-y-2">
                        {submissions.map((submission) => (
                          <div key={submission.submission_id} className="p-4 border rounded relative">
                            <MovieDisplay 
                              movieId={submission.movie_id}
                            />
                            <p className="text-sm text-gray-600 mt-2">
                              Submitted by: {submission.users?.name}
                            </p>
                            {currentUser && submission.user_id === currentUser.user_id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteSubmission(submission.submission_id)}
                                className="absolute top-2 right-2 h-6 w-6"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {currentPhase === 'voting' && (
                    <div className="space-y-4">
                      {isLoadingVotes ? (
                        <div className="text-center py-8">
                          <p>Loading votes...</p>
                        </div>
                      ) : hasVoted && !isEditingVotes ? (
                        <div className="text-center space-y-4">
                          <p className="text-lg">You have submitted your rankings for this movie night!</p>
                          <Button 
                            onClick={() => setIsEditingVotes(true)}
                            variant="outline"
                          >
                            Edit Rankings
                          </Button>
                          <div className="space-y-2 mt-4">
                            {userVotes.map((submission, index) => (
                              <div key={submission.submission_id} className="p-4 border rounded flex items-center gap-4">
                                <span className="text-2xl text-gray-400">#{index + 1}</span>
                                <div className="flex-1">
                                  <MovieDisplay movieId={submission.movie_id} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-gray-600 mb-4">
                            Drag and drop the movies to rank them in your preferred order
                          </p>
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={({ active, over }) => {
                              if (over && active.id !== over.id) {
                                setUserVotes((items) => {
                                  const oldIndex = items.findIndex((i) => i.submission_id === active.id);
                                  const newIndex = items.findIndex((i) => i.submission_id === over.id);
                                  return arrayMove(items, oldIndex, newIndex);
                                });
                              }
                            }}
                          >
                            <SortableContext items={userVotes.map(s => s.submission_id)} strategy={rectSortingStrategy}>
                              <div className="space-y-2">
                                {userVotes.map((submission, index) => (
                                  <SortableItem key={submission.submission_id} id={submission.submission_id}>
                                    <div className="p-4 border rounded flex items-center gap-4">
                                      <span className="text-2xl text-gray-400">#{index + 1}</span>
                                      <div className="flex-1">
                                        <MovieDisplay movieId={submission.movie_id} />
                                      </div>
                                    </div>
                                  </SortableItem>
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
                          <Button 
                            onClick={async () => {
                              await handleSubmitVotes();
                              setIsEditingVotes(false);
                            }}
                            className="w-full mt-4"
                          >
                            {isEditingVotes ? 'Update Rankings' : 'Submit Rankings'}
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {currentPhase === 'winner' && winner && (
                    <div>
                      <h2 className="text-2xl font-bold mb-2 text-center">🎬 Tonight's Movie 🎬</h2>
                      <MovieDisplay 
                        movieId={winner.movie_id}
                      />
                      <p className="text-sm text-gray-600 mt-4">
                        Submitted by: {winner.users?.name}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
      <TMDBAttribution />
    </div>
  );
}

export default App;